"use client";

import { useEffect, useMemo, useState } from "react";
import { maxUint256, parseUnits, type Address } from "viem";
import { gatewayAbi, hookAbi, swapRouterAbi, tokenAbi } from "@/lib/abis";
import { fmtPrice, fmtUnits, poolKey, publicClient, short } from "@/lib/chain";
import type { State } from "@/lib/useCorvex";
import type { useWallet } from "@/lib/useWallet";

type Wallet = ReturnType<typeof useWallet>;
const MIN_SQRT = 4295128739n + 1n;
const MAX_SQRT = 1461446703485210103287273052203988822378723970342n - 1n;
const STATUS = ["Open", "Filled", "Partial", "Refunded", "Cancelled"];
const BAND = 0.02;

/** Constant-product estimate of the price after a trade, good enough for a live hint. */
function estimate(c: State, buy: boolean, amount: number): number | null {
  const s = c.snap!;
  if (s.liquidity === 0n || amount <= 0) return null;
  const P = Number(s.poolPrice) / 1e18;
  const L = Number(s.liquidity);
  const { stock: sd, quote: qd } = c.decimals;
  const raw = c.stockIs0 ? (P * 10 ** qd) / 10 ** sd : (1 / P) * (10 ** sd / 10 ** qd);
  const sq = Math.sqrt(raw);
  const stockRes = (c.stockIs0 ? L / sq : L * sq) / 10 ** sd;
  const quoteRes = (c.stockIs0 ? L * sq : L / sq) / 10 ** qd;
  return buy ? P * Math.pow(1 + amount / quoteRes, 2) : P * Math.pow(stockRes / (stockRes + amount), 2);
}

export function Orders({ c, w, onChange }: { c: State; w: Wallet; onChange: () => void }) {
  const d = c.deployment!;
  const s = c.snap!;
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [from, setFrom] = useState<"local" | "base">("local");
  const [amount, setAmount] = useState("");
  const [limit, setLimit] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const num = Number(amount);
  const est = useMemo(() => estimate(c, side === "buy", num), [c, side, num]);
  const ref = s.mode === 1 ? Number(s.darkRefPrice) / 1e18 : Number(s.poolPrice) / 1e18;
  const outOfBand = est !== null && Math.abs(est - ref) / ref > BAND;

  let hint: string | null = null;
  if (num > 0) {
    if (s.mode === 2) hint = "Trading is paused until the cross runs.";
    else if (s.mode === 1) hint = outOfBand ? `Queues until the open. This trade would move the price to about $${est!.toFixed(2)}, past the 2% band.` : `Fills now at about $${est?.toFixed(2)}, inside the 2% band.`;
    else hint = est ? `Fills now at about $${est.toFixed(2)}.` : null;
  }

  async function submit() {
    setMsg(null);
    setBusy(true);
    try {
      const owner = w.account;
      if (!owner) throw new Error("Connect a wallet first.");
      const limitPrice = limit ? parseUnits(limit, 18) : 0n;
      const inToken: Address = side === "buy" ? d.quoteToken : d.stockToken;
      const inDec = side === "buy" ? c.decimals.quote : c.decimals.stock;
      const amt = parseUnits(amount, inDec);
      const spender = from === "base" && side === "buy" ? d.gatewayBase! : d.swapRouter;

      const allowance = (await publicClient.readContract({ address: inToken, abi: tokenAbi, functionName: "allowance", args: [owner, spender] })) as bigint;
      if (allowance < amt) await w.write({ address: inToken, abi: tokenAbi, functionName: "approve", args: [spender, maxUint256] });

      if (from === "base" && side === "buy") {
        const fee = (await publicClient.readContract({ address: d.gatewayBase!, abi: gatewayAbi, functionName: "quote", args: [d.poolId, owner, d.quoteToken, amt, limitPrice] })) as bigint;
        await w.write({ address: d.gatewayBase!, abi: gatewayAbi, functionName: "placeOrder", args: [d.poolId, owner, d.quoteToken, amt, limitPrice], value: fee });
      } else {
        const buy = side === "buy";
        const zeroForOne = buy ? !c.stockIs0 : c.stockIs0;
        const hookData = ("0x" + owner.slice(2).padStart(64, "0") + limitPrice.toString(16).padStart(64, "0")) as `0x${string}`;
        await w.write({
          address: d.swapRouter,
          abi: swapRouterAbi,
          functionName: "swap",
          args: [poolKey(d), { zeroForOne, amountSpecified: -amt, sqrtPriceLimitX96: zeroForOne ? MIN_SQRT : MAX_SQRT }, { takeClaims: false, settleUsingBurn: false }, hookData],
        });
      }
      setMsg({ ok: true, text: s.mode === 1 && outOfBand ? "Order queued." : "Order placed." });
      setAmount("");
      onChange();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message.split("\n")[0] : "Order failed" });
    } finally {
      setBusy(false);
    }
  }

  async function act(fn: "cancel" | "withdraw", args: readonly unknown[]) {
    setMsg(null);
    try {
      await w.write({ address: d.hook, abi: hookAbi, functionName: fn, args });
      setMsg({ ok: true, text: fn === "cancel" ? "Order cancelled. Withdraw to get the funds back." : "Withdrawn." });
      onChange();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message.split("\n")[0] : "Failed" });
    }
  }

  const unit = side === "buy" ? "USDG" : "TSLA";

  return (
    <div className="grid gap-8 lg:grid-cols-[22rem_1fr]">
      <form onSubmit={(e) => (e.preventDefault(), submit())} className="space-y-5 rounded-2xl border border-line p-6">
        <h2 className="text-lg font-semibold">Place order</h2>
        <div role="group" aria-label="Side" className="grid grid-cols-2 gap-2">
          {(["buy", "sell"] as const).map((x) => (
            <button type="button" key={x} onClick={() => (setSide(x), x === "sell" && setFrom("local"))} aria-pressed={side === x} className={`rounded-lg border px-3 py-2 text-sm font-medium ${side === x ? "border-ink bg-ink text-paper" : "border-line"}`}>
              {x === "buy" ? "Buy TSLA" : "Sell TSLA"}
            </button>
          ))}
        </div>
        {side === "buy" && d.gatewayBase && (
          <label className="block text-sm">
            <span className="text-slate">Pay from</span>
            <select value={from} onChange={(e) => setFrom(e.target.value as "local" | "base")} className="mt-1 w-full rounded-lg border border-line bg-paper px-3 py-2">
              <option value="local">Robinhood Chain</option>
              <option value="base">Base Sepolia (CCIP)</option>
            </select>
          </label>
        )}
        <label className="block text-sm">
          <span className="text-slate">Amount ({unit})</span>
          <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.0" className="num mt-1 w-full rounded-lg border border-line bg-paper px-3 py-2" />
        </label>
        <label className="block text-sm">
          <span className="text-slate">{side === "buy" ? "Max price" : "Min price"} (optional)</span>
          <input inputMode="decimal" value={limit} onChange={(e) => setLimit(e.target.value)} placeholder="No limit" className="num mt-1 w-full rounded-lg border border-line bg-paper px-3 py-2" />
        </label>
        {hint && <p data-testid="hint" className={`rounded-lg px-3 py-2 text-sm ${s.mode === 1 && outOfBand ? "bg-amber/15" : "bg-paper-2"}`}>{hint}</p>}
        <button disabled={busy || !num || s.mode === 2} className="w-full rounded-lg bg-cobalt px-4 py-3 font-medium text-white disabled:opacity-40">
          {busy ? "Waiting for the chain" : s.mode === 1 && outOfBand ? "Queue order" : "Place order"}
        </button>
        {msg && <p role="status" className={`text-sm ${msg.ok ? "text-mint" : "text-rose"}`}>{msg.text}</p>}
      </form>

      <div className="space-y-8">
        <section>
          <h2 className="text-lg font-semibold">Queue</h2>
          {c.orders.length === 0 ? (
            <p className="mt-3 text-slate">No orders in this session. Large trades placed while the pool is dark appear here.</p>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[34rem] text-left text-sm">
                <thead className="text-slate">
                  <tr><th className="py-2 font-normal">Side</th><th className="font-normal">Size</th><th className="font-normal">Limit</th><th className="font-normal">Owner</th><th className="font-normal">Status</th><th /></tr>
                </thead>
                <tbody data-testid="queue">
                  {c.orders.map((o, i) => (
                    <tr key={i} className="border-t border-line">
                      <td className="py-2">{o.buy ? "Buy" : "Sell"}{o.srcSelector !== 0n && <span className="ml-2 rounded bg-paper-2 px-1.5 text-xs">CCIP</span>}</td>
                      <td className="num">{o.buy ? `${fmtUnits(o.amountIn, c.decimals.quote)} USDG` : `${fmtUnits(o.amountIn, c.decimals.stock)} TSLA`}</td>
                      <td className="num">{o.limitPrice === maxUint256 || o.limitPrice === 0n ? "none" : `$${fmtPrice(o.limitPrice)}`}</td>
                      <td className="num">{short(o.owner)}</td>
                      <td>{STATUS[o.status]}</td>
                      <td className="text-right">
                        {o.status === 0 && (s.mode === 1 || s.mode === 2) && (w.account?.toLowerCase() === o.owner.toLowerCase() || s.expired) && (
                          <button onClick={() => act("cancel", [poolKey(d), s.sessionId, BigInt(i)])} className="text-cobalt underline-offset-4 hover:underline">Cancel</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {c.crosses[0] && s.mode >= 2 && <p className="mt-3 text-sm text-slate">Last cross cleared at <span className="num">${fmtPrice(c.crosses[0].price)}</span>.</p>}
        </section>
        <Claims c={c} w={w} act={act} />
      </div>
    </div>
  );
}

function Claims({ c, w, act }: { c: State; w: Wallet; act: (fn: "withdraw", args: readonly unknown[]) => Promise<void> }) {
  const d = c.deployment!;
  const [claims, setClaims] = useState<{ stock: bigint; quote: bigint } | null>(null);
  useEffect(() => {
    if (!w.account) return;
    let live = true;
    Promise.all([
      publicClient.readContract({ address: d.hook, abi: hookAbi, functionName: "credits", args: [w.account, d.stockToken] }),
      publicClient.readContract({ address: d.hook, abi: hookAbi, functionName: "credits", args: [w.account, d.quoteToken] }),
    ]).then(([stock, quote]) => live && setClaims({ stock: stock as bigint, quote: quote as bigint }));
    return () => {
      live = false;
    };
  }, [w.account, c.updatedAt, d.hook, d.stockToken, d.quoteToken]);
  if (!w.account) return null;
  return (
    <section>
      <h2 className="text-lg font-semibold">Your claims</h2>
      {!claims || (claims.stock === 0n && claims.quote === 0n) ? (
        <p className="mt-3 text-slate">Nothing to withdraw. Fills and refunds show up here after a cross.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {claims.stock > 0n && (
            <li className="flex items-center justify-between rounded-xl border border-line px-4 py-3">
              <span className="num">{fmtUnits(claims.stock, c.decimals.stock, 4)} TSLA</span>
              <button onClick={() => act("withdraw", [d.stockToken, w.account])} className="rounded-lg bg-ink px-3 py-1.5 text-sm text-paper">Withdraw</button>
            </li>
          )}
          {claims.quote > 0n && (
            <li className="flex items-center justify-between rounded-xl border border-line px-4 py-3">
              <span className="num">{fmtUnits(claims.quote, c.decimals.quote)} USDG</span>
              <button onClick={() => act("withdraw", [d.quoteToken, w.account])} className="rounded-lg bg-ink px-3 py-1.5 text-sm text-paper">Withdraw</button>
            </li>
          )}
        </ul>
      )}
    </section>
  );
}
