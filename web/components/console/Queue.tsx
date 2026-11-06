"use client";

import { fmtPrice, fmtUnits, short } from "@/lib/chain";
import type { State } from "@/lib/useCorvex";

const status = [
  { label: "In queue", tone: "bg-amber/15 text-amber", hint: "Waiting for the cross." },
  { label: "Settled", tone: "bg-mint/15 text-mint", hint: "Filled at the cross price." },
  { label: "Part settled", tone: "bg-mint/15 text-mint", hint: "Part filled at the cross price, the rest returned." },
  { label: "Refunded", tone: "bg-slate/20 text-ink", hint: "The limit price missed the cross price, so the input came back." },
  { label: "Cancelled", tone: "bg-slate/20 text-ink", hint: "Cancelled by its owner." },
];

/** Every order the pool has seen, with where it stands: waiting in the queue, or settled at the cross. */
export function Queue({ c }: { c: State }) {
  const rows = c.orders.map((o, n) => ({ o, n })).reverse();
  const waiting = c.orders.filter((o) => o.status === 0).length;
  const last = c.crosses.at(-1);
  return (
    <section>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">Order queue</h2>
        <p className="text-sm text-slate">
          <span className="num">{waiting}</span> in queue
          {last && <> · last cross at <span className="num">${fmtPrice(last.price)}</span> cleared <span className="num">{last.orders}</span> orders</>}
        </p>
      </div>
      {rows.length === 0 ? (
        <p className="mt-3 rounded-xl border border-line px-4 py-5 text-slate">No orders yet. A large trade placed while the market is closed shows up here as In queue, then as Settled after the cross.</p>
      ) : (
        <div className="mt-3 overflow-x-auto rounded-xl border border-line">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="bg-paper-2 text-slate">
              <tr>
                <th className="px-4 py-2 font-medium">#</th>
                <th className="px-4 py-2 font-medium">Side</th>
                <th className="px-4 py-2 font-medium">Size</th>
                <th className="px-4 py-2 font-medium">Limit</th>
                <th className="px-4 py-2 font-medium">Owner</th>
                <th className="px-4 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 12).map(({ o, n }) => {
                const st = status[o.status] ?? status[0];
                return (
                  <tr key={n} className="border-t border-line">
                    <td className="num px-4 py-2.5">{n + 1}</td>
                    <td className="px-4 py-2.5">{o.buy ? "Buy" : "Sell"}</td>
                    <td className="num px-4 py-2.5">{o.buy ? `${fmtUnits(o.amountIn, c.decimals.quote)} USDG` : `${fmtUnits(o.amountIn, c.decimals.stock, 4)} TSLA`}</td>
                    <td className="num px-4 py-2.5">{o.limitPrice > 0n ? `$${fmtPrice(o.limitPrice)}` : "none"}</td>
                    <td className="num px-4 py-2.5">
                      {short(c.vaultUsers[o.owner] ?? o.owner)}
                      {o.srcSelector !== 0n && <span className="ml-2 text-xs text-slate">cross-chain</span>}
                    </td>
                    <td className="px-4 py-2.5"><span title={st.hint} className={`rounded-md px-2.5 py-1 text-xs font-semibold ${st.tone}`}>{st.label}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {rows.length > 12 && <p className="mt-2 text-sm text-slate">Showing the latest 12 of {rows.length}.</p>}
    </section>
  );
}
