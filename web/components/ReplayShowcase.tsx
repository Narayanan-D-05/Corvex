"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PnlLive } from "./PnlLive";
import { WeekendTape, usePlayhead } from "./WeekendTape";
import { CROSS, scenarios } from "@/lib/weekend";
import { reducedMotion } from "@/lib/motion";

const caption = (t: number, queued: number) =>
  t < 0.02 ? "Friday close. The last price is recorded."
  : t < CROSS - 0.01 ? (queued ? `The market is closed. ${queued} large order${queued > 1 ? "s" : ""} wait in the queue while small ones still fill.` : "The market is closed. Trades inside the 2% band still fill.")
  : t < CROSS + 0.05 ? "The reference is back. The queue clears at one price."
  : "The falling fee walks the pool to the reference. LPs keep the surplus.";

/** The replay, playing by itself on the landing page. It loops, and it pauses when you ask. */
export function ReplayShowcase() {
  const [sc, setSc] = useState(0);
  const { t, setT, playing, setPlaying } = usePlayhead();
  const [still, setStill] = useState(false);
  const scenario = scenarios[sc];
  const queued = scenario.orders.filter((o) => o.at <= t).length;

  useEffect(() => {
    const reduce = reducedMotion();
    setStill(reduce);
    if (reduce) setT(1);
    else setPlaying(true);
  }, [setT, setPlaying]);

  // loop: hold the finished weekend for a few seconds, then start the next one
  useEffect(() => {
    if (still || t < 1) return;
    const id = setTimeout(() => {
      setSc((s) => (s + 1) % scenarios.length);
      setT(0);
      setPlaying(true);
    }, 4500);
    return () => clearTimeout(id);
  }, [t, still, setT, setPlaying]);

  const pick = (k: number) => {
    setSc(k);
    setT(0);
    setPlaying(!still);
  };

  return (
    <section id="replay" className="dark-ui relative isolate overflow-hidden">
      <div aria-hidden="true" className="columns pointer-events-none absolute inset-y-0 left-1/2 -z-10 w-[min(1200px,100%)] -translate-x-1/2" />
      <div className="mx-auto max-w-[1200px] px-6 py-28">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="tag text-lime">[ Replay ]</p>
            <h2 className="mt-5 max-w-[16ch] font-display text-5xl leading-[1.02] md:text-6xl">
              Watch a whole weekend <span className="text-lime">play out.</span>
            </h2>
          </div>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Scenario">
            {scenarios.map((s, k) => (
              <button key={s.id} onClick={() => pick(k)} aria-pressed={sc === k} className={`tag lift rounded-md border px-4 py-2.5 ${sc === k ? "border-lime bg-lime text-night" : "border-white/20 text-snow/80 hover:border-white/50"}`}>
                {s.title}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-10 rounded-2xl border border-line bg-[#0e1f19] p-5 md:p-7">
          <WeekendTape scenario={scenario} t={t} picked={null} onPick={() => {}} />
          <div className="mt-5 flex flex-wrap items-center gap-4">
            {!still && (
              <button onClick={() => (t >= 1 ? (setT(0), setPlaying(true)) : setPlaying(!playing))} className="tag lift w-24 rounded-md border border-white/20 px-4 py-2.5 hover:border-white/50">
                {playing ? "Pause" : t >= 1 ? "Replay" : "Play"}
              </button>
            )}
            <input aria-label="Replay position" type="range" min={0} max={1000} value={Math.round(t * 1000)} onChange={(e) => (setPlaying(false), setT(Number(e.target.value) / 1000))} className="min-w-[10rem] flex-1 accent-[#c9ff5c]" />
          </div>
          <p className="mt-4 min-h-[3rem] max-w-[60ch] text-snow/80" aria-live="off">{caption(t, t < CROSS ? queued : 0)}</p>
        </div>

        <div className="mt-8 grid gap-8 md:grid-cols-[1fr_1.1fr] md:items-center">
          <p className="max-w-[44ch] text-lg text-slate">{scenario.note}</p>
          <div className="rounded-2xl border border-line bg-paper-2 p-7">
            <PnlLive scenario={scenario} t={t} />
          </div>
        </div>
        <Link href="/replay" className="tag lift mt-10 inline-block rounded-md border border-white/20 px-6 py-3.5 hover:border-white/50">
          Open the full replay
        </Link>
      </div>
    </section>
  );
}
