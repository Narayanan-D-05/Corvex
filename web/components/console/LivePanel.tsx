"use client";

import { useState } from "react";
import { hookAbi, tokenAbi } from "@/lib/abis";
import { LIVE_PROOF, proofUrl } from "@/lib/liveProof";
import { poolKey, short } from "@/lib/chain";
import type { State } from "@/lib/useCorvex";
import type { useWallet } from "@/lib/useWallet";

type Wallet = ReturnType<typeof useWallet>;
const WHERE = { robinhood: "Robinhood", arbitrum: "Arbitrum", ccip: "CCIP" } as const;

/** Testnet only: a public faucet and the one permissionless step, plus the real weekend this deployment has run. */
export function LivePanel({ c, w, onChange }: { c: State; w: Wallet; onChange: () => void }) {
  const d = c.deployment!;
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function run(label: string, ok: string, fn: () => Promise<unknown>) {
    setBusy(label);
    setMsg(null);
    try {
      await fn();
      setMsg({ ok: true, text: ok });
      onChange();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message.split("\n")[0] : "Failed" });
    } finally {
      setBusy(null);
    }
  }

  const faucet = async () => {
    if (!w.account) throw new Error("Connect a wallet first.");
    await w.write({ address: d.stockToken, abi: tokenAbi, functionName: "mint", args: [w.account, 100n * 10n ** BigInt(c.decimals.stock)] });
    await w.write({ address: d.quoteToken, abi: tokenAbi, functionName: "mint", args: [w.account, 50_000n * 10n ** BigInt(c.decimals.quote)] });
  };

  return (
    <section aria-label="Live testnet" className="space-y-8">
      <div className="rounded-2xl border border-dashed border-line p-6">
        <h2 className="text-lg font-semibold">Try it on Robinhood Chain Testnet</h2>
        <p className="mt-1 max-w-[60ch] text-sm text-slate">
          You need a little testnet ETH for gas. The tokens are free: they are mock TSLA and USDG. The pool closes and reopens on a schedule run by the team, so a large order queues whenever the pool is dark. Anyone can run the cross.
        </p>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button disabled={!!busy || !w.account} onClick={() => run("faucet", "100 TSLA and 50,000 USDG sent to your wallet.", faucet)} className="rounded-lg border border-ink px-4 py-2 text-sm font-medium disabled:opacity-40">Get test tokens</button>
          <button
            disabled={!!busy || !w.account || c.snap?.mode !== 2}
            onClick={() => run("cross", "The cross ran. Your fill is under Claims.", () => w.write({ address: d.hook, abi: hookAbi, functionName: "executeCross", args: [poolKey(d)] }))}
            className="rounded-lg bg-cobalt px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
          >
            Run the cross
          </button>
          {!w.account && <span className="text-sm text-slate">Connect a wallet to use these.</span>}
          {w.account && c.snap?.mode !== 2 && <span className="text-sm text-slate">The cross can run once the market has reopened.</span>}
        </div>
        {busy && <p className="mt-3 text-sm text-slate">Working: {busy}</p>}
        {msg && <p role="status" className={`mt-3 text-sm ${msg.ok ? "text-mint" : "text-rose"}`}>{msg.text}</p>}
      </div>

      <div>
        <h2 className="text-lg font-semibold">A weekend that already ran here</h2>
        <p className="mt-1 text-sm text-slate">Every step is a real transaction on these testnets.</p>
        <ol className="mt-4 divide-y divide-line rounded-2xl border border-line">
          {LIVE_PROOF.map((s) => (
            <li key={s.id}>
              <a href={proofUrl(s)} target="_blank" rel="noreferrer" className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-paper-2">
                <span>{s.what}</span>
                <span className="num text-sm text-slate">{WHERE[s.chain]} · {short(s.id)}</span>
              </a>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
