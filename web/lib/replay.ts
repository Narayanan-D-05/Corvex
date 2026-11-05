/** Measured by contracts/test/Replay.t.sol (mocks, USDG, 1,000 TSLA / 200,000 USDG pool, 6% gap at the open). */
export type Scenario = {
  id: string;
  title: string;
  note: string;
  pnl: { noHook: number; feeOnly: number; corvex: number };
};

export const scenarios: Scenario[] = [
  {
    id: "auction",
    title: "6% gap, no queued orders",
    note: "The cross has nothing to match, so the decaying-fee auction closes the gap.",
    pnl: { noHook: -157.47, feeOnly: -48.25, corvex: -2.93 },
  },
  {
    id: "weekend",
    title: "Weekend flow, then a 6% gap",
    note: "Two large buys and a sell hit Friday's price in the open pools. Corvex queued them and filled at the reopen price.",
    pnl: { noHook: -115.75, feeOnly: 385.47, corvex: 0 },
  },
];

export const replayCaveat =
  "Foundry replay on mocks with a competitive-arbitrage model. The fee-only pool is an illustrative baseline that charges half the dislocation. The fork replay of the real June 26 weekend needs a Robinhood Chain mainnet RPC.";
