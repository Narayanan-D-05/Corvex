"use client";

import { fmtPrice } from "@/lib/chain";
import type { State } from "@/lib/useCorvex";

const usd = (n: number) => `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

/** How the waiting orders will clear, as a tile: counts, what matches, what goes to the pool, and recent sessions. */
export function Queue({ c }: { c: State }) {
  const s = c.snap!;
  const ref = Number(s.mode === 1 ? s.darkRefPrice : s.poolPrice) / 1e18;
  const open = c.orders.filter((o) => o.status === 0);
  const buys = open.filter((o) => o.buy);
  const sells = open.filter((o) => !o.buy);
  const buyUsd = buys.reduce((t, o) => t + Number(o.amountIn) / 10 ** c.decimals.quote, 0);
  const sellStock = sells.reduce((t, o) => t + Number(o.amountIn) / 10 ** c.decimals.stock, 0);
  const sellUsd = sellStock * ref;
  const matched = Math.min(buyUsd, sellUsd);
  const net = Math.abs(buyUsd - sellUsd);
  const total = Math.max(matched + net, 1);
  const crossAt = (id: bigint) => c.crosses.find((x) => x.sessionId === id);

  return (
    <section aria-label="Queue status" className="tile lg:col-span-4 lg:overflow-y-auto" data-testid="queue-status">
      <h2 className="tag text-lime">[ Queue status ]</h2>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <Stat label="Buys waiting" big={`${buys.length}`} sub={buyUsd ? `${usd(buyUsd)} USDG` : "none"} />
        <Stat label="Sells waiting" big={`${sells.length}`} sub={sellStock ? `${sellStock.toLocaleString("en-US", { maximumFractionDigits: 2 })} TSLA` : "none"} />
      </div>

      <div className="mt-4">
        <div className="flex h-2.5 overflow-hidden rounded-full bg-white/10" aria-hidden="true">
          <div className="h-full bg-lime transition-all duration-700" style={{ width: `${(matched / total) * 100}%` }} />
          <div className="h-full bg-[#6fa8ff] transition-all duration-700" style={{ width: `${(net / total) * 100}%` }} />
        </div>
        <div className="mt-2 flex justify-between gap-3 text-xs text-snow/70">
          <span><i className="mr-1.5 inline-block h-2 w-2 rounded-full bg-lime" />Match each other <span className="num text-snow">{usd(matched)}</span></span>
          <span><i className="mr-1.5 inline-block h-2 w-2 rounded-full bg-[#6fa8ff]" />To the pool <span className="num text-snow">{usd(net)}</span></span>
        </div>
        <p className="mt-2 text-xs text-slate">Matches pay no fee and never touch the pool. Only the net swaps against it, up to the cross price.</p>
      </div>

      <h3 className="tag mt-5 text-snow/50">Recent sessions</h3>
      {c.sessions.length === 0 ? (
        <p className="mt-2 text-sm text-slate">No orders yet. Close the market, then place a large trade.</p>
      ) : (
        <ul className="mt-2 divide-y divide-white/10 text-sm">
          {c.sessions.map((q) => {
            const x = crossAt(q.id);
            return (
              <li key={q.id.toString()} className="flex items-center justify-between gap-2 py-2">
                <span>
                  <span className="num text-snow/60">#{q.id.toString()}</span> <span className="num">{q.buys}</span> buy, <span className="num">{q.sells}</span> sell
                </span>
                {q.open > 0 ? (
                  <span className="tag rounded-md bg-amber/15 px-2 py-1 text-amber">{q.open} in queue</span>
                ) : (
                  <span className="text-slate">{x ? <>cleared at <span className="num text-snow">${fmtPrice(x.price)}</span></> : "settled"}</span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function Stat({ label, big, sub }: { label: string; big: string; sub: string }) {
  return (
    <div className="rounded-xl border border-white/10 px-4 py-3">
      <div className="tag text-snow/50">{label}</div>
      <div className="num mt-1 text-3xl">{big}</div>
      <div className="text-xs text-slate">{sub}</div>
    </div>
  );
}
