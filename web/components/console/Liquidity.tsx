"use client";

import { fmtPrice, fmtUnits } from "@/lib/chain";
import type { State } from "@/lib/useCorvex";

export function Liquidity({ c }: { c: State }) {
  const s = c.snap!;
  const quote = (d0: bigint, d1: bigint) => (c.stockIs0 ? d1 : d0);
  const stock = (d0: bigint, d1: bigint) => (c.stockIs0 ? d0 : d1);

  return (
    <div className="space-y-8">
      <div className="grid gap-4 md:grid-cols-3">
        <Fig label="Pool liquidity" value={s.liquidity.toString()} />
        <Fig label="Pool price" value={`$${fmtPrice(s.poolPrice)}`} />
        <Fig label="Crosses so far" value={String(c.crosses.length)} />
      </div>
      <section>
        <h2 className="text-lg font-semibold">Surplus donated to LPs</h2>
        {c.crosses.length === 0 ? (
          <p className="mt-3 text-slate">No cross has run yet. The surplus from each cross is donated to the pool.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[30rem] text-left text-sm" data-testid="crosses">
              <thead className="text-slate">
                <tr><th className="py-2 font-normal">Session</th><th className="font-normal">Price</th><th className="font-normal">Orders</th><th className="font-normal">Volume</th><th className="font-normal">Donated</th></tr>
              </thead>
              <tbody>
                {c.crosses.map((x, i) => (
                  <tr key={i} className="border-t border-line">
                    <td className="num py-2">{x.sessionId.toString()}</td>
                    <td className="num">${fmtPrice(x.price)}</td>
                    <td className="num">{x.orders}</td>
                    <td className="num">{fmtUnits(x.volume, c.decimals.quote)} USDG</td>
                    <td className="num">
                      {fmtUnits(quote(x.donated0, x.donated1), c.decimals.quote)} USDG
                      {stock(x.donated0, x.donated1) > 0n && `, ${fmtUnits(stock(x.donated0, x.donated1), c.decimals.stock, 4)} TSLA`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <section>
        <h2 className="text-lg font-semibold">Gap auction</h2>
        <p className="mt-3 max-w-[60ch] text-slate">
          After a cross, trades that move the price toward the cross price pay a fee that starts at 5% and falls every block. Trades the other way pay the normal 0.3%. All fees go to LPs.
          {s.mode === 3 ? " The auction is running now." : " No auction is running."}
        </p>
      </section>
    </div>
  );
}

function Fig({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line px-5 py-4">
      <div className="text-sm text-slate">{label}</div>
      <div className="num mt-1 truncate text-2xl">{value}</div>
    </div>
  );
}
