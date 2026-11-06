"use client";

import { fmtPrice } from "@/lib/chain";
import type { State } from "@/lib/useCorvex";

const usd = (n: number) => `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

/** The queue at a glance (how many buys and sells, how much matches), past sessions, and every order with its status. */
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
  const crossAt = (id: bigint) => c.crosses.find((x) => x.sessionId === id);

  return (
    <section aria-label="Queue status" className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Queue status</h2>
        <p className="mt-1 text-sm text-slate">What is waiting for the next cross, and how it will clear.</p>
      </div>

      <div className="grid gap-3 md:grid-cols-4" data-testid="queue-status">
        <Stat label="Buys in queue" big={`${buys.length}`} sub={buyUsd ? `${usd(buyUsd)} USDG` : "nothing waiting"} />
        <Stat label="Sells in queue" big={`${sells.length}`} sub={sellStock ? `${sellStock.toLocaleString("en-US", { maximumFractionDigits: 2 })} TSLA` : "nothing waiting"} />
        <Stat label="Match each other" big={usd(matched)} sub="no pool, no fee" tone="text-mint" />
        <Stat label="Goes to the pool" big={usd(net)} sub={buyUsd === sellUsd ? "nothing" : buyUsd > sellUsd ? "net buy" : "net sell"} />
      </div>

      {c.sessions.length > 0 && (
        <ul className="divide-y divide-line rounded-xl border border-line text-sm">
          {c.sessions.map((q) => {
            const x = crossAt(q.id);
            return (
              <li key={q.id.toString()} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                <span>
                  Session <span className="num">{q.id.toString()}</span>: <span className="num">{q.buys}</span> buy, <span className="num">{q.sells}</span> sell
                </span>
                <span className="text-slate">
                  {q.open > 0 ? <span className="rounded-md bg-amber/15 px-2.5 py-1 text-xs font-semibold text-amber">{q.open} in queue</span> : x ? <>cleared at <span className="num">${fmtPrice(x.price)}</span></> : "settled"}
                </span>
              </li>
            );
          })}
        </ul>
      )}

    </section>
  );
}

function Stat({ label, big, sub, tone = "" }: { label: string; big: string; sub: string; tone?: string }) {
  return (
    <div className="rounded-xl border border-line px-5 py-4">
      <div className="text-sm text-slate">{label}</div>
      <div className={`num mt-1 text-2xl ${tone}`}>{big}</div>
      <div className="text-sm text-slate">{sub}</div>
    </div>
  );
}
