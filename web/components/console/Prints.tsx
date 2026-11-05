"use client";

import { fmtPrice, fmtUnits } from "@/lib/chain";
import type { State } from "@/lib/useCorvex";

const STATUS = ["Not sent", "Recorded", "Attested", "Disputed"];
const tone = ["text-slate", "text-amber", "text-mint", "text-rose"];

function Status({ v, name }: { v: number; name: string }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-slate">{name}</span>
      <span className={`font-medium ${tone[v]}`}>{STATUS[v]}</span>
    </div>
  );
}

export function Prints({ c }: { c: State }) {
  if (c.prints.length === 0) {
    return (
      <p className="text-slate">
        No prints yet. A closing print is recorded when the pool goes dark, and an opening print when the cross runs.
      </p>
    );
  }
  return (
    <div className="space-y-6">
      <p className="max-w-[60ch] text-slate">
        Each print is a token price, multiplier-adjusted. CCIP delivers it as Recorded, and the CRE workflow marks it Attested or Disputed after comparing it with the official price.
      </p>
      <ul className="grid gap-4 md:grid-cols-2" data-testid="prints">
        {c.prints.map((p) => (
          <li key={`${p.sessionId}-${p.kind}`} className="rounded-2xl border border-line p-5">
            <div className="flex items-baseline justify-between">
              <h3 className="font-semibold">{p.kind === 1 ? "Open" : "Close"}, session {p.sessionId.toString()}</h3>
              <span className="num text-2xl">${fmtPrice(p.tokenPrice)}</span>
            </div>
            <dl className="num mt-3 grid grid-cols-3 gap-2 text-sm text-slate">
              <div><dt className="font-sans">Multiplier</dt><dd className="text-ink">{(Number(p.multiplier) / 1e18).toFixed(2)}x</dd></div>
              <div><dt className="font-sans">Orders</dt><dd className="text-ink">{p.orderCount}</dd></div>
              <div><dt className="font-sans">Volume</dt><dd className="text-ink">{p.kind === 1 ? fmtUnits(p.crossVolume, c.decimals.quote) : "n/a"}</dd></div>
            </dl>
            <div className="mt-4 space-y-1.5 border-t border-line pt-4">
              <Status v={p.arb} name="Arbitrum Sepolia" />
              <Status v={p.base} name="Base Sepolia" />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
