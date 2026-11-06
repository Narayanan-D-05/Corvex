"use client";

import { useEffect, useState } from "react";
import { CrossMachine, PHASE, caption, useCycle } from "@/components/CrossMachine";
import type { State } from "@/lib/useCorvex";

type View = { id: string; label: string; line: string; buys: number; sells: number; instant?: boolean; from?: number };

const views: View[] = [
  { id: "weekday", label: "Weekday", line: "The market is open and the feed is live, so every trade fills at once against the pool.", buys: 4, sells: 3, instant: true },
  { id: "weekend", label: "Weekend", line: "The market is closed. Large orders wait in the queue, then clear together at the open.", buys: 10, sells: 6 },
  { id: "holiday", label: "Holiday", line: "A longer closure means a longer queue. It still clears at one price, and the pool only sees the net.", buys: 20, sells: 10 },
  { id: "reopen", label: "After reopen", line: "The feed is back. The queue matches itself, the net swaps against the pool, and the surplus goes to LPs.", buys: 10, sells: 6, from: PHASE.match - 0.04 },
];

/** Which view matches the live pool: open, dark, or past the reopen. */
const liveView = (mode: number) => (mode === 0 ? "weekday" : mode === 1 ? "weekend" : "reopen");

/** How the cross works, drawn. Pick a kind of day, or the real queue when there is one. */
export function MarketView({ c }: { c: State }) {
  const open = c.orders.filter((o) => o.status === 0);
  const liveQueue: View | null = open.length
    ? { id: "live", label: "Live queue", line: "The orders waiting in this pool right now, drawn as they will clear.", buys: open.filter((o) => o.buy).length, sells: open.filter((o) => !o.buy).length, from: 0 }
    : null;
  const all = liveQueue ? [liveQueue, ...views] : views;
  const [pick, setPick] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const current = all.find((v) => v.id === pick) ?? liveQueue ?? all.find((v) => v.id === liveView(c.snap!.mode))!;
  const { u, setU, still } = useCycle(16, { from: current.from ?? 0, paused });
  useEffect(() => setU(current.from ?? 0), [current.id, current.from, setU]);

  const m = current.instant ? 0 : Math.min(current.buys, current.sells);
  const net = Math.abs(current.buys - current.sells);

  return (
    <section aria-label="How the cross works" className="overflow-hidden rounded-2xl border border-line bg-night text-paper">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5">
        <div role="tablist" aria-label="Market view" className="flex flex-wrap gap-2">
          {all.map((v) => (
            <button
              key={v.id}
              role="tab"
              aria-selected={current.id === v.id}
              onClick={() => setPick(v.id)}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${current.id === v.id ? "bg-cobalt text-white" : "bg-paper/10 text-paper/80 hover:bg-paper/15"}`}
            >
              {v.label}
            </button>
          ))}
        </div>
        <span className="text-xs text-paper/60">Live pool: {["Normal", "Dark", "Awaiting reopen", "Auction"][c.snap!.mode]}</span>
      </div>
      <p className="px-5 pt-3 text-paper/80">{current.line}</p>
      <div className="px-5 pt-2">
        <CrossMachine u={u} buys={current.buys} sells={current.sells} instant={current.instant} />
      </div>
      <p className="px-5 text-paper/90" aria-live="off">{caption(u, current.buys, current.sells, !!current.instant)}</p>
      <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-paper/10 px-5 py-3 text-sm">
        <button onClick={() => setPaused((p) => !p)} disabled={still} className="rounded-lg bg-paper/10 px-3 py-1.5 hover:bg-paper/15 disabled:opacity-40">{paused ? "Play" : "Pause"}</button>
        <span><span className="num">{current.buys}</span> buys</span>
        <span><span className="num">{current.sells}</span> sells</span>
        {!current.instant && <span className="text-[#2ee6a0]"><span className="num">{m}</span> matched with each other</span>}
        <span><span className="num">{current.instant ? current.buys + current.sells : net}</span> {current.instant ? "swap against the pool" : "go to the pool"}</span>
      </div>
    </section>
  );
}
