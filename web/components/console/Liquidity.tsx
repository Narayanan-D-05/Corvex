"use client";

import { fmtPrice, fmtUnits } from "@/lib/chain";
import type { State } from "@/lib/useCorvex";

/** Constant-product reserves in the current range, for a plain-language "what is in the pool". */
function reserves(c: State) {
  const s = c.snap!;
  const L = Number(s.liquidity);
  const P = Number(s.poolPrice) / 1e18;
  if (!L || !P) return null;
  const { stock: sd, quote: qd } = c.decimals;
  const raw = c.stockIs0 ? (P * 10 ** qd) / 10 ** sd : (1 / P) * (10 ** sd / 10 ** qd);
  const sq = Math.sqrt(raw);
  return {
    stock: (c.stockIs0 ? L / sq : L * sq) / 10 ** sd,
    quote: (c.stockIs0 ? L * sq : L / sq) / 10 ** qd,
  };
}

export function Liquidity({ c }: { c: State }) {
  const s = c.snap!;
  const quote = (d0: bigint, d1: bigint) => (c.stockIs0 ? d1 : d0);
  const stock = (d0: bigint, d1: bigint) => (c.stockIs0 ? d0 : d1);
  const r = reserves(c);
  const paidQuote = c.crosses.reduce((t, x) => t + quote(x.donated0, x.donated1), 0n);
  const paidStock = c.crosses.reduce((t, x) => t + stock(x.donated0, x.donated1), 0n);

  return (
    <div className="space-y-4 pb-2">
      <div className="grid gap-4 md:grid-cols-4">
        <div className="tile">
          <div className="tag text-snow/50">In the pool</div>
          <div className="num mt-2 text-2xl">{r ? `${r.stock.toLocaleString("en-US", { maximumFractionDigits: 0 })} TSLA` : "empty"}</div>
          <div className="num text-lg text-snow/70">{r ? `${r.quote.toLocaleString("en-US", { maximumFractionDigits: 0 })} USDG` : ""}</div>
          <div className="mt-1 text-xs text-slate">About, at the current price</div>
        </div>
        <div className="tile">
          <div className="tag text-snow/50">Pool price</div>
          <div className="num mt-2 text-3xl">${fmtPrice(s.poolPrice)}</div>
          <div className="mt-1 text-xs text-slate">Per TSLA</div>
        </div>
        <div className="tile">
          <div className="tag text-snow/50">Paid to LPs by crosses</div>
          <div className="num mt-2 text-2xl text-lime">{fmtUnits(paidQuote, c.decimals.quote)} USDG</div>
          <div className="num text-lg text-lime/80">{fmtUnits(paidStock, c.decimals.stock, 4)} TSLA</div>
          <div className="mt-1 text-xs text-slate">Surplus donated, all crosses</div>
        </div>
        <div className="tile">
          <div className="tag text-snow/50">Crosses so far</div>
          <div className="num mt-2 text-3xl">{c.crosses.length}</div>
          <div className="mt-1 text-xs text-slate">One per reopen with orders or a gap</div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="tile lg:col-span-2">
          <h2 className="tag text-lime">[ Past crosses ]</h2>
          {c.crosses.length === 0 ? (
            <p className="mt-3 text-slate">No cross has run yet. When one does, the surplus is donated to the pool and shows up here.</p>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[30rem] text-left text-sm" data-testid="crosses">
                <thead className="tag text-snow/50">
                  <tr><th className="py-2 font-normal">Session</th><th className="font-normal">Cleared at</th><th className="font-normal">Orders</th><th className="font-normal">Traded</th><th className="font-normal">Paid to LPs</th></tr>
                </thead>
                <tbody>
                  {c.crosses.map((x, i) => {
                    const q = quote(x.donated0, x.donated1);
                    const st = stock(x.donated0, x.donated1);
                    return (
                      <tr key={i} className="border-t border-white/10">
                        <td className="num py-2.5">#{x.sessionId.toString()}</td>
                        <td className="num text-lime">${fmtPrice(x.price)}</td>
                        <td className="num">{x.orders}</td>
                        <td className="num">{fmtUnits(x.volume, c.decimals.quote)} USDG</td>
                        <td className="num">{q === 0n && st === 0n ? <span className="text-slate">nothing left over</span> : <>{q > 0n && `${fmtUnits(q, c.decimals.quote)} USDG`}{q > 0n && st > 0n && ", "}{st > 0n && `${fmtUnits(st, c.decimals.stock, 4)} TSLA`}</>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <div className="space-y-4">
          <section className="tile">
            <h2 className="tag text-lime">[ How LPs get paid ]</h2>
            <ul className="mt-3 space-y-2 text-sm text-slate">
              <li><span className="text-snow">Surplus.</span> Orders pay the cross price. The pool leg often costs less, and the difference is donated to LPs.</li>
              <li><span className="text-snow">Fees.</span> Every swap pays the normal 0.3%, and all of it goes to LPs.</li>
              <li><span className="text-snow">The gap.</span> The falling fee after a cross makes bots pay for closing it.</li>
            </ul>
          </section>
          <section className={`tile ${s.mode === 3 ? "border-lime/50" : ""}`}>
            <h2 className="tag text-lime">[ Gap auction ]</h2>
            <p className="mt-3 text-sm text-slate">
              After a cross, trades toward the cross price pay a fee that starts at 5% and falls every block. Trades the other way pay the normal 0.3%.
            </p>
            <p className={`mt-3 text-sm font-medium ${s.mode === 3 ? "text-lime" : "text-snow/60"}`}>{s.mode === 3 ? "Running now." : "Not running."}</p>
          </section>
        </div>
      </div>
    </div>
  );
}
