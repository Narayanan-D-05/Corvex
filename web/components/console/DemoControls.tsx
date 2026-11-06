"use client";

import { useState } from "react";
import { concatHex, encodeAbiParameters, parseAbiParameters, stringToHex } from "viem";
import { hookAbi, marketAbi, feedAbi, oracleAbi, tokenAbi } from "@/lib/abis";
import { DEMO_ACCOUNTS, poolKey, publicClient } from "@/lib/chain";
import type { State } from "@/lib/useCorvex";
import type { useWallet } from "@/lib/useWallet";

type Wallet = ReturnType<typeof useWallet>;

/** Local chain only: plays the exchange, the price feed and the CRE forwarder from the node's unlocked accounts. */
export function DemoControls({ c, w, onChange }: { c: State; w: Wallet; onChange: () => void }) {
  const d = c.deployment!;
  const owner = DEMO_ACCOUNTS[0];
  const [price, setPrice] = useState("212");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function run(label: string, fn: () => Promise<unknown>) {
    setBusy(label);
    setMsg(null);
    try {
      await fn();
      onChange();
    } catch (e) {
      setMsg(e instanceof Error ? e.message.split("\n")[0] : "Failed");
    } finally {
      setBusy(null);
    }
  }

  const tx = (address: `0x${string}`, abi: readonly unknown[], functionName: string, args: readonly unknown[] = []) =>
    w.write({ address, abi: abi as never, functionName, args, as: owner });

  const attest = async () => {
    // judge every recorded print on the Arbitrum-side oracle, as the forwarder would
    for (const p of c.prints) {
      if (p.arb !== 1) continue;
      const key = (await publicClient.readContract({ address: d.oracleArb!, abi: oracleAbi, functionName: "keyOf", args: [d.stockToken, p.sessionId, p.kind] })) as `0x${string}`;
      const report = encodeAbiParameters(parseAbiParameters("bytes32, bool, int32, uint64"), [key, true, 0, 3478487238524512106n]);
      const metadata = concatHex([`0x${"00".repeat(31)}01`, stringToHex("corvex", { size: 10 }), owner, "0x0000"]);
      await tx(d.oracleArb!, oracleAbi, "onReport", [metadata, report]);
    }
  };

  const fund = async () => {
    if (!w.account) throw new Error("Pick a demo account first.");
    await tx(d.stockToken, tokenAbi, "mint", [w.account, 1000n * 10n ** BigInt(c.decimals.stock)]);
    await tx(d.quoteToken, tokenAbi, "mint", [w.account, 1_000_000n * 10n ** BigInt(c.decimals.quote)]);
  };

  const ghost = "tag lift rounded-md border border-white/20 px-4 py-2.5 hover:border-white/50 disabled:opacity-40";
  return (
    <section aria-label="Demo controls" className="tile lg:col-span-12">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="tag mr-2 text-lime" title="Local chain only. These stand in for the exchange, the price feed and the CRE forwarder.">[ Demo controls ]</h2>
        <button disabled={!!busy} onClick={() => run("tokens", fund)} className={ghost}>Get test tokens</button>
        <span className="mx-1 hidden h-6 w-px bg-white/10 md:block" aria-hidden="true" />
        <button disabled={!!busy} onClick={() => run("close", async () => { await tx(d.marketStatus, marketAbi, "setOpen", [false]); await tx(d.hook, hookAbi, "poke", [poolKey(d)]); })} className={ghost}>Close market</button>
        <label className="flex items-center gap-2 text-sm text-slate">
          <span className="tag">Reopen price</span>
          <input value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" className="num w-24 rounded-md border border-white/15 bg-transparent px-3 py-2 text-snow" />
        </label>
        <button disabled={!!busy} onClick={() => run("open", async () => { await tx(d.marketStatus, marketAbi, "setOpen", [true]); await tx(d.feed, feedAbi, "setAnswer", [BigInt(Math.round(Number(price) * 1e8))]); await tx(d.hook, hookAbi, "poke", [poolKey(d)]); })} className={ghost}>Reopen market</button>
        <button disabled={!!busy} onClick={() => run("cross", () => tx(d.hook, hookAbi, "executeCross", [poolKey(d)]))} className="tag lift rounded-md bg-lime px-4 py-2.5 text-night disabled:opacity-40">Run cross</button>
        <button disabled={!!busy || !d.oracleArb} onClick={() => run("attest", attest)} className={ghost}>Attest prints</button>
        <span className="ml-auto text-sm text-slate" role="status">{busy ? `Working: ${busy}` : msg ? <span className="text-rose">{msg}</span> : ""}</span>
      </div>
    </section>
  );
}
