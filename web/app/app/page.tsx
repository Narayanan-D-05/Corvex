"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Wordmark } from "@/components/Logo";
import { CursorGlow } from "@/components/Motion";
import { Overview } from "@/components/console/Overview";
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
  { id: "trade", label: "Trade" },
  { id: "prints", label: "Prints" },
  { id: "liquidity", label: "Liquidity" },
] as const;
type Tab = (typeof tabs)[number]["id"];

export default function Console() {
  const c = useCorvex();
  const w = useWallet();
  const [tab, setTab] = useState<Tab>("trade");
  const [walletError, setWalletError] = useState<string | null>(null);

  useEffect(() => {
    const raw = window.location.hash.slice(1);
    const h = (raw === "overview" || raw === "orders" ? "trade" : raw) as Tab;
    if (tabs.some((t) => t.id === h)) setTab(h);
  }, []);
  const pick = (t: Tab) => {
    setTab(t);
    history.replaceState(null, "", `#${t}`);
  };

  return (
    <div className="dark-ui relative isolate flex min-h-screen flex-col lg:h-screen lg:overflow-hidden">
      <CursorGlow />
      <div aria-hidden="true" className="columns pointer-events-none absolute inset-y-0 left-1/2 -z-10 w-[min(1400px,100%)] -translate-x-1/2" />
      <div aria-hidden="true" className="pointer-events-none absolute -right-32 -top-24 -z-10 h-[520px] w-[520px] rounded-full bg-lime/10 blur-[130px]" />

      <header className="shrink-0">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-6">
            <Link href="/" aria-label="Corvex home" className="text-lime"><Wordmark /></Link>
            <nav aria-label="Console" className="flex gap-1 rounded-lg border border-white/10 bg-white/[0.03] p-1">
              {tabs.map((t) => (
                <button key={t.id} onClick={() => pick(t.id)} aria-current={tab === t.id ? "page" : undefined} className={`tag rounded-md px-4 py-2 transition-colors ${tab === t.id ? "bg-lime text-night" : "text-snow/70 hover:bg-white/10 hover:text-snow"}`}>
                  {t.label}
                </button>
              ))}
            </nav>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="tag rounded-md border border-white/10 px-3 py-2 text-snow/70">{chain.name}</span>
            {w.account ? (
              <span className="flex items-center gap-2">
                <span className="num rounded-md bg-white/[0.06] px-3 py-2">{short(w.account)}</span>
                <button onClick={w.disconnect} className="tag text-slate hover:text-snow">Disconnect</button>
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <button onClick={() => w.connect().catch((e) => setWalletError(e.message))} className="tag lift rounded-md bg-lime px-4 py-2.5 text-night">Connect wallet</button>
                {isLocal && (
                  <select aria-label="Demo account" defaultValue="" onChange={(e) => e.target.value && w.useDemo(e.target.value as `0x${string}`)} className="rounded-md border border-white/15 bg-[#0e1f19] px-2 py-2.5">
                    <option value="">Demo account</option>
                    {DEMO_ACCOUNTS.slice(1).map((a, i) => <option key={a} value={a}>Demo {i + 1} ({short(a)})</option>)}
                  </select>
                )}
              </span>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full min-h-0 max-w-[1400px] flex-1 flex-col px-4 pb-4">
        {walletError && <p role="alert" className="mb-3 text-rose">{walletError}</p>}
        {c.loading && <p className="text-slate">Reading the chain.</p>}
        {!c.loading && c.error && !c.snap && (
          <div className="tile">
            <h1 className="text-xl font-semibold">Can&apos;t reach the pool</h1>
            <p className="mt-2 text-slate">{c.error}</p>
            <p className="mt-4 text-sm text-slate">
              Start a local chain with <code className="num">anvil</code>, deploy with <code className="num">forge script script/DeployLocal.s.sol --broadcast</code>, then run <code className="num">npm run sync</code> in <code className="num">web</code>.
            </p>
          </div>
        )}
        {c.snap && c.deployment && (
          <>
            {tab === "trade" && (
              <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-12 lg:grid-rows-[auto_auto_minmax(0,1fr)]">
                <Overview c={c} />
                {isLocal ? <DemoControls c={c} w={w} onChange={c.refresh} /> : <LivePanel c={c} w={w} onChange={c.refresh} />}
                <Orders c={c} w={w} onChange={c.refresh} />
                <Queue c={c} />
              </div>
            )}
            {tab === "prints" && <div className="min-h-0 flex-1 overflow-y-auto"><Prints c={c} /></div>}
            {tab === "liquidity" && <div className="min-h-0 flex-1 overflow-y-auto"><Liquidity c={c} /></div>}
          </>
        )}
      </main>
    </div>
  );
}
