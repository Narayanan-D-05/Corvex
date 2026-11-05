import {
  CronCapability,
  EVMClient,
  HTTPClient,
  LAST_FINALIZED_BLOCK_NUMBER,
  Runner,
  TxStatus,
  bytesToHex,
  consensusIdenticalAggregation,
  consensusMedianAggregation,
  encodeCallMsg,
  getNetwork,
  handler,
  json,
  logTriggerConfig,
  ok,
  prepareReportRequest,
  text,
  type NodeRuntime,
  type Runtime,
} from '@chainlink/cre-sdk'
import {
  decodeEventLog,
  decodeFunctionResult,
  encodeFunctionData,
  keccak256,
  toEventSelector,
  zeroAddress,
  type Hex,
} from 'viem'
import { z } from 'zod'
import { controllerAbi, oracleAbi } from './abi'
import {
  buildSchedule,
  deviationBps,
  encodeSchedule,
  encodeVerdict,
  isWithin,
  officialTokenPrice,
  parsePositiveDecimalE8,
  scheduleKey,
  sessionDate,
  type CalendarEntry,
} from './logic'

const hex = (n: number) => z.string().regex(new RegExp(`^0x[0-9a-fA-F]{${n}}$`))

const configSchema = z.object({
  schedule: z.string(),
  /** CRE chain selector name of the chain that holds the oracle and controller */
  chainName: z.string(),
  oracleAddress: hex(40),
  controllerAddress: hex(40),
  /** CCIP-independent chain id used in reports for replay protection: this chain's CCIP selector */
  selfSelector: z.string().regex(/^\d+$/),
  maxDeviationBps: z.number().int().positive(),
  /** where the official open and close come from */
  provider: z.enum(['mock', 'polygon']),
  officialPriceApi: z.string(),
  /** lower-cased token address -> exchange symbol */
  symbols: z.record(z.string()),
  calendarApi: z.string(),
  gasLimit: z.string().regex(/^\d+$/),
})
type Config = z.infer<typeof configSchema>

const KIND_OPEN = 1
const PRINT_RECEIVED = toEventSelector(oracleAbi.find((x) => x.type === 'event')!)

function evmClient(config: Config): EVMClient {
  const network = getNetwork({ chainFamily: 'evm', chainSelectorName: config.chainName, isTestnet: true })
  if (!network) throw new Error(`unknown chain selector name: ${config.chainName}`)
  return new EVMClient(network.chainSelector.selector)
}

function writeReport(runtime: Runtime<Config>, receiver: Hex, payload: Hex): string {
  const report = runtime.report(prepareReportRequest(payload)).result()
  const res = evmClient(runtime.config)
    .writeReport(runtime, { receiver, report, gasConfig: { gasLimit: runtime.config.gasLimit } })
    .result()
  if (res.txStatus !== TxStatus.SUCCESS) throw new Error(res.errorMessage ?? `write status ${res.txStatus}`)
  if (!res.txHash) throw new Error('write succeeded without a transaction hash')
  return bytesToHex(res.txHash)
}

// ---------------------------------------------------------------------------------------------------------------
// Handler 1: attest a print
// ---------------------------------------------------------------------------------------------------------------

type OfficialRequest = { symbol: string; kind: number; token: string; session: string; ts: number; apiKey: string }

/** Runs on every DON node. Returns the official per-share price at 8 dp; nodes agree on the median. */
const fetchOfficial = (node: NodeRuntime<Config>, r: OfficialRequest): bigint => {
  const http = new HTTPClient()
  if (node.config.provider === 'mock') {
    const url =
      `${node.config.officialPriceApi}?symbol=${encodeURIComponent(r.symbol)}&token=${r.token}` +
      `&session=${r.session}&kind=${r.kind === KIND_OPEN ? 'open' : 'close'}`
    const res = http.sendRequest(node, { url, method: 'GET' }).result()
    if (!ok(res)) throw new Error(`official price API returned HTTP ${res.statusCode}`)
    const body = z.object({ pricePerShare: z.string() }).parse(json(res))
    return parsePositiveDecimalE8(body.pricePerShare)
  }
  // Polygon daily open/close: https://polygon.io/docs/stocks/get_v1_open-close__stocksticker___date
  const url =
    `${node.config.officialPriceApi}/${encodeURIComponent(r.symbol)}/${sessionDate(r.ts)}` +
    `?adjusted=false&apiKey=${r.apiKey}`
  const res = http.sendRequest(node, { url, method: 'GET' }).result()
  if (!ok(res)) throw new Error(`official price API returned HTTP ${res.statusCode}`)
  const body = z.object({ open: z.number(), close: z.number() }).parse(json(res))
  return parsePositiveDecimalE8((r.kind === KIND_OPEN ? body.open : body.close).toFixed(8))
}

const onPrintReceived = (runtime: Runtime<Config>, log: { data: Uint8Array; topics: Uint8Array[] }): string => {
  const { args } = decodeEventLog({
    abi: oracleAbi,
    eventName: 'PrintReceived',
    data: bytesToHex(log.data),
    topics: log.topics.map((t) => bytesToHex(t)) as [Hex, ...Hex[]],
  })
  const { key, token, sessionId, kind, tokenPrice, multiplier, timestamp } = args

  const symbol = runtime.config.symbols[token.toLowerCase()]
  if (!symbol) throw new Error(`no exchange symbol configured for token ${token}`)

  // Secrets are read in DON mode and handed to the node callback as an argument.
  const apiKey =
    runtime.config.provider === 'polygon' ? runtime.getSecret({ id: 'MARKET_DATA_API_KEY' }).result().value : ''

  const ts = Number(timestamp)
  const perShare = runtime
    .runInNodeMode(fetchOfficial, consensusMedianAggregation<bigint>())({
      symbol,
      kind,
      token,
      session: sessionId.toString(),
      ts,
      apiKey,
    })
    .result()

  // Split-safe: the print is a token price, so compare it with per-share x the multiplier stored in the print.
  const official = officialTokenPrice(perShare, multiplier)
  const dev = deviationBps(tokenPrice, official)
  const attested = isWithin(dev, runtime.config.maxDeviationBps)
  runtime.log(
    `print ${key} kind=${kind} printed=${tokenPrice} official=${official} dev=${dev}bps -> ${attested ? 'attested' : 'disputed'}`,
  )

  const payload = encodeVerdict(key, attested, dev, BigInt(runtime.config.selfSelector))
  const tx = writeReport(runtime, runtime.config.oracleAddress as Hex, payload)
  return JSON.stringify({ key, attested, deviationBps: dev, tx })
}

// ---------------------------------------------------------------------------------------------------------------
// Handler 2: build the reopen schedule
// ---------------------------------------------------------------------------------------------------------------

const calendarSchema = z.array(
  z.object({
    poolId: hex(64),
    nextClose: z.number().int(),
    nextOpen: z.number().int(),
    pendingMultiplier: z.string().nullable(),
  }),
)

const fetchCalendar = (node: NodeRuntime<Config>): string => {
  const res = new HTTPClient().sendRequest(node, { url: node.config.calendarApi, method: 'GET' }).result()
  if (!ok(res)) throw new Error(`calendar API returned HTTP ${res.statusCode}`)
  return text(res)
}

function readController<T>(runtime: Runtime<Config>, client: EVMClient, fn: 'lastNonce' | 'scheduleHash', poolId: Hex): T {
  const reply = client
    .callContract(runtime, {
      call: encodeCallMsg({
        from: zeroAddress,
        to: runtime.config.controllerAddress as Hex,
        data: encodeFunctionData({ abi: controllerAbi, functionName: fn, args: [poolId] }),
      }),
      blockNumber: LAST_FINALIZED_BLOCK_NUMBER,
    })
    .result()
  return decodeFunctionResult({ abi: controllerAbi, functionName: fn, data: bytesToHex(reply.data) }) as T
}

const onScheduleTick = (runtime: Runtime<Config>): string => {
  const raw = runtime.runInNodeMode(fetchCalendar, consensusIdenticalAggregation<string>())().result()
  const entries: CalendarEntry[] = calendarSchema.parse(JSON.parse(raw)).map((e) => ({
    ...e,
    poolId: e.poolId as Hex,
  }))
  const nowSec = Math.floor(runtime.now().getTime() / 1000)
  const client = evmClient(runtime.config)
  const sent: string[] = []

  // Two reads per pool: stay inside the 15-read limit.
  for (const e of entries.slice(0, 7)) {
    const s = buildSchedule(e, nowSec)
    if (!s) continue
    const want = keccak256(scheduleKey(s.darkFrom, s.reopenAt, s.expectedMultiplier))
    const have = readController<Hex>(runtime, client, 'scheduleHash', e.poolId)
    if (have === want) continue // already delivered

    const nonce = readController<bigint>(runtime, client, 'lastNonce', e.poolId) + 1n
    const payload = encodeSchedule(
      BigInt(runtime.config.selfSelector),
      e.poolId,
      s.darkFrom,
      s.reopenAt,
      s.expectedMultiplier,
      nonce,
    )
    const tx = writeReport(runtime, runtime.config.controllerAddress as Hex, payload)
    runtime.log(`schedule for ${e.poolId}: dark ${s.darkFrom} -> reopen ${s.reopenAt} mult ${s.expectedMultiplier} tx ${tx}`)
    sent.push(tx)
  }
  return JSON.stringify({ scheduled: sent.length, txs: sent })
}

// ---------------------------------------------------------------------------------------------------------------

const initWorkflow = (config: Config) => {
  const client = evmClient(config)
  return [
    handler(
      client.logTrigger(
        logTriggerConfig({
          addresses: [config.oracleAddress as Hex],
          topics: [[PRINT_RECEIVED]],
          confidence: 'FINALIZED',
        }),
      ),
      onPrintReceived,
    ),
    handler(new CronCapability().trigger({ schedule: config.schedule }), onScheduleTick),
  ]
}

export async function main() {
  const runner = await Runner.newRunner<Config>({ configSchema })
  await runner.run(initWorkflow)
}

main()
