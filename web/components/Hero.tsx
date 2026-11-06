"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

const WeekendScene = dynamic(() => import("./WeekendScene"), { ssr: false });

export function Hero() {
  const progress = useRef(0);
  const [still, setStill] = useState(true);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setStill(reduce);
    setMounted(true);
    if (reduce) return;
    const onScroll = () => {
      progress.current = Math.min(1, Math.max(0, window.scrollY / (window.innerHeight * 0.85)));
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <section className="relative isolate flex min-h-[100svh] items-end overflow-hidden bg-night text-paper">
      <div className="absolute inset-0 -z-10" aria-hidden="true">
        {mounted && <WeekendScene progress={progress} mode="loop" still={still} />}
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-6 z-10 mx-auto hidden max-w-[1100px] justify-end gap-5 px-4 text-xs text-paper/70 md:flex" aria-hidden="true">
        {[["#ff8a73", "Pool with no hook"], ["#eef2fa", "Corvex pool"], ["#6f95ff", "Chainlink price"], ["#7ea0ff", "Queued order"], ["#2ee6a0", "Filled at the cross"]].map(([c, l]) => (
          <span key={l} className="flex items-center gap-2">
            <i className="inline-block h-2 w-2 rounded-full" style={{ background: c }} />
            {l}
          </span>
        ))}
      </div>
      <div className="relative z-10 mx-auto w-full max-w-[1100px] px-4 pb-20 pt-40 md:pb-28">
        <h1 className="max-w-[12ch] font-display text-[clamp(3.2rem,10vw,8.5rem)] leading-[0.95] tracking-tight">
          Monday&apos;s open, cleared once.
        </h1>
        <p className="mt-6 max-w-[46ch] text-lg text-paper/80">
          A Uniswap v4 hook that clears stock-token orders in one fair cross at the market open.
        </p>
        <div className="mt-9 flex flex-wrap items-center gap-4">
          <Link href="/app" className="rounded-lg bg-cobalt px-6 py-3 font-medium text-white transition-transform hover:-translate-y-0.5">
            Launch app
          </Link>
          <Link href="/#how" className="px-2 py-3 text-paper/80 underline-offset-4 hover:text-paper hover:underline">
            See how a cross works
          </Link>
        </div>
      </div>
    </section>
  );
}
