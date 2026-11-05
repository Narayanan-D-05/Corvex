// Mock market-data API for CRE simulation. Serves the official per-share open/close and a reopen calendar.
//   node server.mjs [data.json]    env: PORT (8787), POOL_ID (0x... bytes32 for /calendar)
import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'

const file = process.argv[2] ?? new URL('./data.json', import.meta.url)
const data = JSON.parse(readFileSync(file, 'utf8'))
const port = Number(process.env.PORT ?? 8787)
const poolId = process.env.POOL_ID ?? '0x' + '00'.repeat(32)

export function handle(url) {
  const u = new URL(url, 'http://x')
  if (u.pathname === '/official') {
    const symbol = u.searchParams.get('symbol')
    const session = u.searchParams.get('session')
    const kind = u.searchParams.get('kind')
    const price = data.symbols?.[symbol]?.[session]?.[kind]
    if (!price) return [404, { error: `no ${kind} price for ${symbol} session ${session}` }]
    return [200, { pricePerShare: price }]
  }
  if (u.pathname === '/calendar') {
    const now = Math.floor(Date.now() / 1000)
    const c = data.calendar
    return [
      200,
      [
        {
          poolId,
          nextClose: now + c.nextCloseOffsetSeconds,
          nextOpen: now + c.nextOpenOffsetSeconds,
          pendingMultiplier: c.pendingMultiplier,
        },
      ],
    ]
  }
  return [404, { error: 'not found' }]
}

if (!process.env.VITEST) {
  createServer((req, res) => {
    const [status, body] = handle(req.url)
    res.writeHead(status, { 'content-type': 'application/json' })
    res.end(JSON.stringify(body))
  }).listen(port, () => console.log(`mock market-data API on http://localhost:${port}`))
}
