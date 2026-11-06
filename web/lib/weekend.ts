/**
 * One weekend, drawn by the hero scene, the scroll story and the replay chart.
 * Time runs 0 (Friday close) to 1; the market reopens and the cross runs at CROSS.
 * The end points match contracts/test/Replay.t.sol (1,000 TSLA / 200,000 USDG pool, 6% gap).
 * The paths between them are illustrative: they show the shape of the weekend, not a market feed.
 */
export const CROSS = 0.86;
export const CLOSE_PRICE = 200;
export const OPEN_PRICE = 212;
export const P_STAR = 211.8;
export const BAND = 0.02;

type Keys = readonly (readonly [number, number])[];

const ease = (x: number) => x * x * (3 - 2 * x);

/** Value of a keyframed series at time t, eased between keys. */
export function at(keys: Keys, t: number): number {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    const [t1, v1] = keys[i];
    if (t <= t1) {
      const [t0, v0] = keys[i - 1];
      return v0 + (v1 - v0) * ease((t - t0) / (t1 - t0 || 1));
    }
  }
  return keys[keys.length - 1][1];
}

export type OrderKind = "filled" | "refunded";
export type WeekendOrder = {
  id: number;
  side: "buy" | "sell";
  at: number;
  limit: number;
  usd: number;
  kind: OrderKind;
  story: string;
};

export type WeekendScenario = {
  id: "weekend" | "auction";
  title: string;
  note: string;
  noHook: Keys;
  corvex: Keys;
  lpNoHook: Keys;
  lpCorvex: Keys;
  /** the fee-only pool: an illustrative baseline, see the replay caveat */
  lpFeeOnly: Keys;
  orders: WeekendOrder[];
  pnl: { noHook: number; feeOnly: number; corvex: number };
};

const orders: WeekendOrder[] = [
  { id: 1, side: "buy", at: 0.18, limit: 215, usd: 5000, kind: "filled", story: "Too big for the 2% band, so it became a claim in the queue. Its limit of $215 is above the cross price, so it filled at $211.80." },
  { id: 2, side: "sell", at: 0.32, limit: 190, usd: 2000, kind: "filled", story: "A sell of 10 TSLA with a $190 floor. It waited, then sold at $211.80, well above its floor." },
  { id: 3, side: "buy", at: 0.46, limit: 208, usd: 1500, kind: "refunded", story: "This buyer would only pay $208. The cross cleared at $211.80, so the order was refunded in full." },
  { id: 4, side: "buy", at: 0.58, limit: 220, usd: 3000, kind: "filled", story: "A large buy with a generous $220 limit. It cleared at $211.80 with the rest of the queue." },
  { id: 5, side: "sell", at: 0.7, limit: 214, usd: 2500, kind: "refunded", story: "This seller wanted at least $214. The cross cleared lower, so the tokens came back untouched." },
  { id: 6, side: "buy", at: 0.8, limit: 213, usd: 1800, kind: "filled", story: "Arrived late on Sunday. Orders that clear at one price get the same fill however early they arrived." },
];

export const scenarios: WeekendScenario[] = [
  {
    id: "weekend",
    title: "Weekend flow, then a 6% gap",
    note: "Large orders hit Friday's price in an open pool, one bot trade at a time. In Corvex they wait and clear once.",
    noHook: [[0, 200], [0.17, 200], [0.19, 202.6], [0.31, 202.6], [0.33, 201.4], [0.57, 201.4], [0.59, 204.6], [0.79, 204.6], [0.81, 207.4], [0.86, 207.4], [0.9, 212], [1, 212]],
    corvex: [[0, 200], [0.1, 200], [0.12, 201.4], [0.3, 201.4], [0.32, 202.8], [0.55, 202.8], [0.57, 203.9], [0.85, 203.9], [0.89, 211.8], [1, 212]],
    lpNoHook: [[0, 0], [0.17, 0], [0.19, -22], [0.33, -18], [0.57, -18], [0.59, -36], [0.79, -36], [0.81, -70], [0.86, -70], [0.9, -115.75], [1, -115.75]],
    lpCorvex: [[0, 0], [1, 0]],
    lpFeeOnly: [[0, 0], [0.17, 0], [0.19, 38], [0.33, 44], [0.57, 44], [0.59, 112], [0.79, 120], [0.81, 236], [0.86, 250], [0.9, 385.47], [1, 385.47]],
    orders,
    pnl: { noHook: -115.75, feeOnly: 385.47, corvex: 0 },
  },
  {
    id: "auction",
    title: "6% gap, no queued orders",
    note: "Nothing to match, so the cross has nothing to net. The falling fee closes the gap and LPs keep the fees.",
    noHook: [[0, 200], [0.86, 200], [0.9, 212], [1, 212]],
    corvex: [[0, 200], [0.86, 200], [0.9, 204], [1, 212]],
    lpNoHook: [[0, 0], [0.86, 0], [0.9, -157.47], [1, -157.47]],
    lpCorvex: [[0, 0], [0.86, 0], [1, -2.93]],
    lpFeeOnly: [[0, 0], [0.86, 0], [0.9, -30], [1, -48.25]],
    orders: [],
    pnl: { noHook: -157.47, feeOnly: -48.25, corvex: -2.93 },
  },
];

export const weekend = scenarios[0];

/** Orders waiting in the queue at time t: they build up all weekend and clear at the cross. */
export function queueAt(list: WeekendOrder[], t: number) {
  if (t >= CROSS) return { count: 0, usd: 0 };
  const q = list.filter((o) => o.at <= t);
  return { count: q.length, usd: q.reduce((s, o) => s + o.usd, 0) };
}

/** Where an order sits at time t: at its limit while it waits, then sliding to the cross price. */
export function orderAt(o: WeekendOrder, t: number) {
  const slide = ease(Math.min(1, Math.max(0, (t - CROSS) / 0.05)));
  return {
    time: o.at + (0.9 - o.at) * slide,
    price: o.limit + (P_STAR - o.limit) * slide,
    shown: t >= o.at,
    slide,
  };
}
