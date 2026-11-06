"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Wordmark } from "@/components/Logo";
import { Overview } from "@/components/console/Overview";
import { MarketView } from "@/components/console/MarketView";
import { Queue } from "@/components/console/Queue";
import { Orders } from "@/components/console/Orders";
import { Prints } from "@/components/console/Prints";
import { Liquidity } from "@/components/console/Liquidity";
import { DemoControls } from "@/components/console/DemoControls";
import { LivePanel } from "@/components/console/LivePanel";
import { DEMO_ACCOUNTS, chain, isLocal, short } from "@/lib/chain";
import { useCorvex } from "@/lib/useCorvex";
import { useWallet } from "@/lib/useWallet";

const tabs = [
  { id: "overview", label: "Overview" },
  { id: "orders", label: "Orders" },
  { id: "prints", label: "Prints" },
  { id: "liquidity", label: "Liquidity" },
] as const;
type Tab = (typeof tabs)[number]["id"];

export default function Console() {
  const c = useCorvex();
  const w = useWallet();
  const [tab, setTab] = useState<Tab>("overview");
  const [walletError, setWalletError] = useState<string | null>(null);

  useEffect(() => {
    const h = window.location.hash.slice(1) as Tab;
    if (tabs.some((t) => t.id === h)) setTab(h);
  }, []);
  const pick = (t: Tab) => {
    setTab(t);
    history.replaceState(null, "", `#${t}`);
  };

  return (
    <div className="min-h-screen">
      <header className="border-b border-line bg-paper/90 backdrop-blur">
        <div className="mx-auto flex max-w-[1100px] flex-wrap items-center justify-between gap-3 px-4 py-3">
          <Link href="/" aria-label="Corvex home"><Wordmark /></Link>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="rounded-md bg-paper-2 px-2.5 py-1">{chain.name}</span>
            {w.account ? (
              <span className="flex items-center gap-2">
                <span className="num">{short(w.account)}</span>
                <button onClick={w.disconnect} className="text-slate underline-offset-4 hover:underline">Disconnect</button>
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <button onClick={() => w.connect().catch((e) => setWalletError(e.message))} className="rounded-lg bg-ink px-4 py-2 font-medium text-paper">Connect wallet</button>
                {isLocal && (
                  <select aria-label="Demo account" defaultValue="" onChange={(e) => e.target.value && w.useDemo(e.target.value as `0x${string}`)} className="rounded-lg border border-line bg-paper px-2 py-2">
                    <option value="">Demo account</option>
                    {DEMO_ACCOUNTS.slice(1).map((a, i) => <option key={a} value={a}>Demo {i + 1} ({short(a)})</option>)}
                  </select>
                )}
              </span>
            )}
          </div>
        </div>
        <nav aria-label="Console" className="mx-auto flex max-w-[1100px] gap-1 px-4">
          {tabs.map((t) => (
            <button key={t.id} onClick={() => pick(t.id)} aria-current={tab === t.id ? "page" : undefined} className={`border-b-2 px-4 py-2.5 text-sm font-medium ${tab === t.id ? "border-cobalt text-ink" : "border-transparent text-slate hover:text-ink"}`}>
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      <main className="mx-auto max-w-[1100px] px-4 py-10">
        {walletError && <p role="alert" className="mb-6 text-rose">{walletError}</p>}
        {c.loading && <p className="text-slate">Reading the chain.</p>}
        {!c.loading && c.error && !c.snap && (
          <div className="rounded-2xl border border-line p-6">
            <h1 className="text-xl font-semibold">Can&apos;t reach the pool</h1>
            <p className="mt-2 text-slate">{c.error}</p>
            <p className="mt-4 text-sm text-slate">
              Start a local chain with <code className="num">anvil</code>, deploy with <code className="num">forge script script/DeployLocal.s.sol --broadcast</code>, then run <code className="num">npm run sync</code> in <code className="num">web</code>.
            </p>
          </div>
        )}
        {c.snap && c.deployment && (
          <>
            {tab === "overview" && (
              <div className="space-y-8">
                <Overview c={c} />
                <MarketView c={c} />
                <Queue c={c} />
                {isLocal ? <DemoControls c={c} w={w} onChange={c.refresh} /> : <LivePanel c={c} w={w} onChange={c.refresh} />}
              </div>
            )}
            {tab === "orders" && <Orders c={c} w={w} onChange={c.refresh} />}
            {tab === "prints" && <Prints c={c} />}
            {tab === "liquidity" && <Liquidity c={c} />}
          </>
        )}
      </main>
    </div>
  );
}
