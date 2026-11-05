import { describe, expect, it } from 'vitest'
import {
  buildSchedule,
  deviationBps,
  encodeVerdict,
  isWithin,
  officialTokenPrice,
  parsePositiveDecimalE8,
  sessionDate,
} from './logic'

describe('parsePositiveDecimalE8', () => {
  it('scales to 8 dp', () => {
    expect(parsePositiveDecimalE8('3500.12345678')).toBe(350012345678n)
    expect(parsePositiveDecimalE8('212')).toBe(21200000000n)
    expect(parsePositiveDecimalE8('0.5')).toBe(50000000n)
  })
  it('rejects over-precision, signs, exponents, zero and junk', () => {
    for (const bad of ['3500.123456789', '-1', '+1', '1e3', ' 1', '01', '.5', '5.', '0', '0.00000000', '']) {
      expect(() => parsePositiveDecimalE8(bad)).toThrow()
    }
  })
})

describe('split-safe comparison', () => {
  it('multiplies the per-share price by the multiplier', () => {
    // post-split: $106 per share, multiplier 2.0 -> $212 per token
    expect(officialTokenPrice(parsePositiveDecimalE8('106'), 2n * 10n ** 18n)).toBe(212n * 10n ** 18n)
  })
  it('does not flag a split-day open that is continuous in token terms', () => {
    const printed = 212n * 10n ** 18n
    const official = officialTokenPrice(parsePositiveDecimalE8('106.2'), 2n * 10n ** 18n)
    expect(isWithin(deviationBps(printed, official), 150)).toBe(true)
  })
  it('flags a print that is a per-share price on a split day', () => {
    const printed = 106n * 10n ** 18n // forgot the multiplier
    const official = officialTokenPrice(parsePositiveDecimalE8('106'), 2n * 10n ** 18n)
    const dev = deviationBps(printed, official)
    expect(dev).toBe(-5000)
    expect(isWithin(dev, 150)).toBe(false)
  })
})

describe('deviationBps', () => {
  it('is signed and truncates toward zero', () => {
    expect(deviationBps(101n, 100n)).toBe(100)
    expect(deviationBps(99n, 100n)).toBe(-100)
    expect(deviationBps(10001n, 10000n)).toBe(1)
  })
  it('rejects a non-positive official price', () => {
    expect(() => deviationBps(1n, 0n)).toThrow()
  })
})

describe('encodeVerdict', () => {
  it('encodes four 32-byte words', () => {
    const key = ('0x' + '11'.repeat(32)) as `0x${string}`
    const enc = encodeVerdict(key, true, -42, 3478487238524512106n)
    expect(enc.length).toBe(2 + 4 * 64)
  })
})

describe('buildSchedule', () => {
  const now = 1_000
  const poolId = ('0x' + '22'.repeat(32)) as `0x${string}`
  it('builds a plain halt window', () => {
    expect(buildSchedule({ poolId, nextClose: 1_100, nextOpen: 2_000, pendingMultiplier: null }, now)).toEqual({
      darkFrom: 1_100,
      reopenAt: 2_000,
      expectedMultiplier: 0n,
    })
  })
  it('carries a pending split multiplier at 18 dp', () => {
    const s = buildSchedule({ poolId, nextClose: 1_100, nextOpen: 2_000, pendingMultiplier: '2' }, now)
    expect(s?.expectedMultiplier).toBe(2n * 10n ** 18n)
  })
  it('drops windows the hook would reject', () => {
    expect(buildSchedule({ poolId, nextClose: 1_100, nextOpen: 900, pendingMultiplier: null }, now)).toBeNull()
    expect(buildSchedule({ poolId, nextClose: 100, nextOpen: 900, pendingMultiplier: null }, now)).toBeNull()
    expect(buildSchedule({ poolId, nextClose: 1_100, nextOpen: 1_100 + 11 * 86_400, pendingMultiplier: null }, now)).toBeNull()
    expect(buildSchedule({ poolId, nextClose: 1_100, nextOpen: 2_000, pendingMultiplier: '0' }, now)).toBeNull()
    expect(buildSchedule({ poolId, nextClose: 1_100, nextOpen: 2_000, pendingMultiplier: '-2' }, now)).toBeNull()
  })
})

describe('sessionDate', () => {
  it('keeps weekdays', () => {
    expect(sessionDate(Date.UTC(2026, 5, 26, 20, 0) / 1000)).toBe('2026-06-26') // Friday
  })
  it('rolls weekends back to Friday', () => {
    expect(sessionDate(Date.UTC(2026, 5, 27, 9, 0) / 1000)).toBe('2026-06-26')
    expect(sessionDate(Date.UTC(2026, 5, 28, 9, 0) / 1000)).toBe('2026-06-26')
  })
})
