"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { usePlayhead } from "@/components/WeekendTape";
import { marketViews } from "@/lib/weekend";
import type { State } from "@/lib/useCorvex";

const WeekendScene = dynamic(() => import("@/components/WeekendScene"), { ssr: false });

/** Which view matches the live pool: open, dark, or past the reopen. */
const liveView = (mode: number) => (mode === 0 ? 0 : mode === 1 ? 1 : 3);

/** The price in 3D. Switch between a weekday, a weekend, a holiday and the moment after the reopen. */
export function MarketView({ c }: { c: State }) {
  const live = liveView(c.snap!.mode);
  const [i, setI] = useState(live);
  const [touched, setTouched] = useState(false);
  const { t, setT, playing, setPlaying } = usePlayhead();
  const progress = useRef(0);
  const [still, setStill] = useState(false);
  const [mounted, setMounted] = useState(false);
  const v = marketViews[i];

  useEffect(() => {
    setMounted(true);
    setStill(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, []);
  // follow the live pool until the person picks a view themselves
  useEffect(() => {
    if (!touched) setI(live);
  }, [live, touched]);
  useEffect(() => {
    setT(0);
    setPlaying(!still);
  }, [i, still, setT, setPlaying]);
  useEffect(() => {
    progress.current = still ? 1 : v.from + (1 - v.from) * t;
  }, [t, v.from, still]);

  return (
    <section aria-label="Price in 3D" className="overflow-hidden rounded-2xl border border-line bg-night text-paper">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5">
        <div role="tablist" aria-label="Market view" className="flex flex-wrap gap-2">
          {marketViews.map((m, k) => (
            <button
              key={m.id}
              role="tab"
              aria-selected={i === k}
              onClick={() => (setTouched(true), setI(k))}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${i === k ? "bg-cobalt text-white" : "bg-paper/10 text-paper/80 hover:bg-paper/15"}`}
            >
              {m.label}
            </button>
          ))}
        </div>
        <span className="text-xs text-paper/60">Live pool: {["Normal", "Dark", "Awaiting reopen", "Auction"][c.snap!.mode]}</span>
      </div>
      <p className="px-5 pt-3 text-paper/80">{v.line}</p>
      <div className="relative mt-3 aspect-[16/9] w-full" aria-hidden="true">
        {mounted && <WeekendScene key={v.id} progress={progress} mode="scrub" still={still} scenario={v.scenario} />}
      </div>
      <div className="flex items-center gap-4 border-t border-paper/10 px-5 py-3">
        <button onClick={() => (t >= 1 ? (setT(0), setPlaying(true)) : setPlaying(!playing))} className="w-20 rounded-lg bg-paper/10 px-3 py-1.5 text-sm hover:bg-paper/15">
          {playing ? "Pause" : t >= 1 ? "Replay" : "Play"}
        </button>
        <input aria-label="Time in the market view" type="range" min={0} max={1000} value={Math.round(t * 1000)} onChange={(e) => (setPlaying(false), setT(Number(e.target.value) / 1000))} className="w-full accent-[#2650ff]" />
      </div>
      <ul className="flex flex-wrap gap-x-5 gap-y-1 px-5 pb-4 text-xs text-paper/65">
        <li><i className="mr-2 inline-block h-2 w-2 rounded-full bg-[#ff8a73]" />Pool with no hook</li>
        <li><i className="mr-2 inline-block h-2 w-2 rounded-full bg-paper" />Corvex pool</li>
        <li><i className="mr-2 inline-block h-2 w-2 rounded-full bg-[#6f95ff]" />Chainlink price (dashed while dark)</li>
        <li><i className="mr-2 inline-block h-2 w-2 rounded-full bg-[#7ea0ff]" />Queued order</li>
        <li><i className="mr-2 inline-block h-2 w-2 rounded-full bg-[#2ee6a0]" />Filled at the cross</li>
        <li><i className="mr-2 inline-block h-2 w-2 rounded-full bg-[#e0a030]" />Refunded</li>
      </ul>
    </section>
  );
}
