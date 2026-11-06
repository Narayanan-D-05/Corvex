"use client";

import { fmtPrice, fmtUnits, isLocal } from "@/lib/chain";
import type { State } from "@/lib/useCorvex";
import { ProofList } from "./LivePanel";

const explain = [
  { n: "1", title: "Recorded", body: "When the market closes or the cross runs, the hook writes down the price. That record is a Session Print." },
  { n: "2", title: "Delivered", body: "Chainlink CCIP carries the print to Arbitrum and Base. From Robinhood Chain this takes 15 to 30 minutes." },
  { n: "3", title: "Checked", body: "A Chainlink CRE workflow compares it with the official price and marks it Attested, or Disputed if it is off." },
];

type Step = { label: string; state: "done" | "wait" | "bad" | "na" };

/** Where a print stands on one chain: delivered there, then checked. */
function steps(v: number, checks: boolean): Step[] {
  const delivered = v >= 1;
  return [
    { label: delivered ? "Delivered" : "In transit", state: delivered ? "done" : "wait" },
    checks
      ? { label: v === 2 ? "Attested" : v === 3 ? "Disputed" : "Waiting for the check", state: v === 2 ? "done" : v === 3 ? "bad" : "wait" }
      : { label: "Not checked here", state: "na" },
  ];
}

const dot = { done: "bg-lime", wait: "bg-white/25", bad: "bg-rose", na: "bg-white/10" };
const text = { done: "text-lime", wait: "text-snow/50", bad: "text-rose", na: "text-snow/35" };

function Chain({ name, v, checks }: { name: string; v: number; checks: boolean }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 rounded-lg border border-white/10 px-3 py-2.5 text-sm">
      <span className="text-snow/80">{name}</span>
      <span className="flex flex-wrap items-center gap-2">
        {steps(v, checks).map((s, i) => (
          <span key={i} className="flex items-center gap-1.5">
            {i > 0 && <i className="h-px w-3 bg-white/20" aria-hidden="true" />}
            <i className={`h-2 w-2 rounded-full ${dot[s.state]} ${s.state === "wait" ? "animate-pulse" : ""}`} aria-hidden="true" />
            <span className={`tag ${text[s.state]}`}>{s.label}</span>
          </span>
        ))}
      </span>
    </div>
  );
}

export function Prints({ c }: { c: State }) {
  return (
    <div className="space-y-4 pb-2">
      <div className="grid gap-4 md:grid-cols-3">
        {explain.map((e) => (
          <div key={e.n} className="tile">
            <div className="flex items-center gap-3">
              <span className="num flex h-7 w-7 items-center justify-center rounded-full border border-lime/50 text-sm text-lime">{e.n}</span>
              <h3 className="font-medium">{e.title}</h3>
            </div>
            <p className="mt-2 text-sm text-slate">{e.body}</p>
          </div>
        ))}
      </div>

      {c.prints.length === 0 ? (
        <div className="tile text-slate">No prints yet. One is recorded when the pool goes dark, and another when the cross runs.</div>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" data-testid="prints">
          {c.prints.map((p) => (
            <li key={`${p.sessionId}-${p.kind}`} className="tile">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-medium">{p.kind === 1 ? "Market open" : "Market close"}</h3>
                  <p className="tag text-snow/50">Session {p.sessionId.toString()}</p>
                </div>
                <span className="num text-3xl text-lime">${fmtPrice(p.tokenPrice)}</span>
              </div>
              <p className="mt-3 text-sm text-slate">
                {p.kind === 1
                  ? p.orderCount === 0
                    ? "No orders were queued. The pool moved to the reopen price."
                    : `The cross cleared ${p.orderCount} order${p.orderCount === 1 ? "" : "s"}, ${fmtUnits(p.crossVolume, c.decimals.quote)} USDG in total.`
                  : "The last price before the pool went dark."}
                {p.multiplier !== 10n ** 18n && ` Adjusted for a ${(Number(p.multiplier) / 1e18).toFixed(2)}x split multiplier.`}
              </p>
              <div className="mt-4 space-y-2">
                <Chain name="Arbitrum Sepolia" v={p.arb} checks />
                <Chain name="Base Sepolia" v={p.base} checks={false} />
              </div>
            </li>
          ))}
        </ul>
      )}
      {!isLocal && <ProofList />}
    </div>
  );
}
