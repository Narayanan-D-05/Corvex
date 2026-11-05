import { encodeAbiParameters, parseAbiParameters, type Hex } from 'viem'

const UINT256_MAX = (1n << 256n) - 1n
export const E8 = 100_000_000n
const INT32_MAX = 2_147_483_647

/** Positive base-10 decimal with at most 8 fractional digits, scaled to 8 dp. Rejects everything else. */
export function parsePositiveDecimalE8(value: string): bigint {
  const match = /^(0|[1-9]\d*)(?:\.(\d{1,8}))?$/.exec(value)
  if (!match) {
    throw new Error('price must be a positive base-10 decimal with at most 8 fractional digits')
  }
  const [, whole, fraction = ''] = match
  const scaled = BigInt(whole) * E8 + BigInt(fraction.padEnd(8, '0'))
  if (scaled <= 0n || scaled > UINT256_MAX) throw new Error('scaled price is outside uint256 bounds')
  return scaled
}

/** Official per-share price (8 dp) to a token price (18 dp): per-share x multiplier (18 dp). */
export function officialTokenPrice(perShareE8: bigint, multiplier: bigint): bigint {
  return (perShareE8 * multiplier) / E8
}

/** Signed deviation of the printed token price from the official one, in bps, truncated toward zero. */
export function deviationBps(printed: bigint, official: bigint): number {
  if (official <= 0n) throw new Error('official price must be positive')
  const bps = ((printed - official) * 10_000n) / official
  if (bps > BigInt(INT32_MAX) || bps < -BigInt(INT32_MAX)) return bps > 0n ? INT32_MAX : -INT32_MAX
  return Number(bps)
}

export function isWithin(dev: number, maxBps: number): boolean {
  return Math.abs(dev) <= maxBps
}

/** Report for SessionPrintOracle._processReport: (bytes32 key, bool attested, int32 deviationBps, uint64 chain). */
export function encodeVerdict(key: Hex, attested: boolean, dev: number, chainSelector: bigint): Hex {
  return encodeAbiParameters(parseAbiParameters('bytes32, bool, int32, uint64'), [
    key,
    attested,
    dev,
    chainSelector,
  ])
}

/** Report for ReopenController._processReport. */
export function encodeSchedule(
  chainSelector: bigint,
  poolId: Hex,
  darkFrom: number,
  reopenAt: number,
  expectedMultiplier: bigint,
  nonce: bigint,
): Hex {
  return encodeAbiParameters(
    parseAbiParameters('uint64, bytes32, uint40, uint40, uint256, uint64'),
    [chainSelector, poolId, darkFrom, reopenAt, expectedMultiplier, nonce],
  )
}

/** Mirrors ReopenController.scheduleHash. */
export function scheduleKey(darkFrom: number, reopenAt: number, expectedMultiplier: bigint): Hex {
  return encodeAbiParameters(parseAbiParameters('uint40, uint40, uint256'), [
    darkFrom,
    reopenAt,
    expectedMultiplier,
  ])
}

export type CalendarEntry = {
  poolId: Hex
  /** next session close, unix seconds */
  nextClose: number
  /** next regular-session open, unix seconds */
  nextOpen: number
  /** pending multiplier change as a decimal string (18 dp), or null */
  pendingMultiplier: string | null
}

export const MAX_WINDOW_SECONDS = 10 * 24 * 3600

/**
 * Turns a calendar entry into a schedule, or null when it is unusable. The hook accepts only windows that end in the
 * future and last at most ten days, so anything else is dropped here instead of being sent and rejected.
 */
export function buildSchedule(
  e: CalendarEntry,
  nowSec: number,
): { darkFrom: number; reopenAt: number; expectedMultiplier: bigint } | null {
  if (!Number.isInteger(e.nextClose) || !Number.isInteger(e.nextOpen)) return null
  if (e.nextOpen <= e.nextClose) return null
  if (e.nextOpen <= nowSec) return null
  if (e.nextOpen - e.nextClose > MAX_WINDOW_SECONDS) return null
  let mult = 0n
  if (e.pendingMultiplier !== null) {
    const m = /^(0|[1-9]\d*)(?:\.(\d{1,18}))?$/.exec(e.pendingMultiplier)
    if (!m) return null
    mult = BigInt(m[1]) * 10n ** 18n + BigInt((m[2] ?? '').padEnd(18, '0'))
    if (mult === 0n) return null
  }
  return { darkFrom: e.nextClose, reopenAt: e.nextOpen, expectedMultiplier: mult }
}

/**
 * UTC trading date (YYYY-MM-DD) a print belongs to. A print recorded on a weekend (a keeper poked late) belongs to
 * the last weekday. Exchange holidays are not modelled; use a calendar-backed provider for those.
 */
export function sessionDate(timestampSec: number): string {
  const d = new Date(timestampSec * 1000)
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}
