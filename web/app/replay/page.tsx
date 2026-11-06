"use client";

import { useState } from "react";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Sections";
import { LossBars } from "@/components/LossBars";
import { WeekendTape, usePlayhead } from "@/components/WeekendTape";
import { replayCaveat, scenarios as measured } from "@/lib/replay";
import { CROSS, scenarios, type WeekendOrder } from "@/lib/weekend";

const phase = (t: number, queued: number) =>
  t < 0.02 ? { mode: "Normal", line: "The close print is recorded at $200." }
  : t < CROSS - 0.01 ? { mode: "Dark", line: queued ? `Large trades queue as claims. Small ones still fill inside the 2% band. ${queued} waiting.` : "The reference is dark. Trades inside the 2% band still fill." }
  : t < CROSS + 0.05 ? { mode: "Cross", line: "The feed is back. Four checks pass and the queue clears at one price." }
  : { mode: "Gap auction", line: "The fee starts at 5% and falls every block while the pool walks to the reference." };

export default function Replay() {
  const [sc, setSc] = useState(0);
  const [picked, setPicked] = useState<WeekendOrder | null>(null);
  const { t, setT, playing, setPlaying } = usePlayhead();
  const scenario = scenarios[sc];
  const result = measured.find((m) => m.id === scenario.id)!;
  const queued = scenario.orders.filter((o) => o.at <= t).length;
  const ph = phase(t, t < CROSS ? queued : 0);
  const end = t >= 0.98;

  const pick = (k: number) => {
    setSc(k);
    setPicked(null);
    setT(0);
    setPlaying(false);
  };

  return (
    <>
      <Navbar alwaysSolid />
      <main className="mx-auto max-w-[1100px] px-4 pb-24 pt-32">
        <h1 className="font-display text-6xl leading-none md:text-7xl">Replay</h1>
        <p className="mt-5 max-w-[58ch] text-lg text-slate">One weekend on one time axis. Press play or drag the slider, and click an order to follow it.</p>

        <div className="mt-8 flex flex-wrap gap-2" role="group" aria-label="Scenario">
          {scenarios.map((s, k) => (
            <button key={s.id} onClick={() => pick(k)} aria-pressed={sc === k} className={`rounded-lg border px-4 py-2 text-sm ${sc === k ? "border-ink bg-ink text-paper" : "border-line"}`}>{s.title}</button>
          ))}
        </div>

        <section className="mt-6 rounded-2xl bg-night p-5 text-paper md:p-7">
          <WeekendTape scenario={scenario} t={t} picked={picked} onPick={setPicked} />
          <div className="mt-5 flex items-center gap-4">
            <button
              onClick={() => (t >= 1 ? (setT(0), setPlaying(true)) : setPlaying(!playing))}
              className="w-20 rounded-lg bg-cobalt px-4 py-2 text-sm font-medium text-white"
            >
              {playing ? "Pause" : t >= 1 ? "Replay" : "Play"}
            </button>
            <input
              aria-label="Replay position"
              type="range"
              min={0}
              max={1000}
              value={Math.round(t * 1000)}
              onChange={(e) => (setPlaying(false), setT(Number(e.target.value) / 1000))}
              className="w-full accent-[#2650ff]"
            />
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-[1fr_1.2fr]">
            <div>
              <span className="rounded-md bg-paper/10 px-3 py-1 text-sm font-semibold">{ph.mode}</span>
              <p className="mt-3 max-w-[44ch] text-paper/80">{ph.line}</p>
            </div>
            <div className="min-h-[4.5rem] rounded-lg border border-paper/15 p-4 text-sm">
              {picked ? (
                <>
                  <p className="font-semibold">{picked.side === "buy" ? "Buy" : "Sell"} of ${picked.usd.toLocaleString("en-US")}, limit ${picked.limit}</p>
                  <p className="mt-1 text-paper/75">{picked.story}</p>
                </>
              ) : (
                <p className="text-paper/60">{scenario.orders.length ? "Click an order dot to see why it was queued and what happened to it." : "No orders queued in this weekend. The auction does the work."}</p>
              )}
            </div>
          </div>
          <ul className="mt-5 flex flex-wrap gap-x-5 gap-y-1 text-xs text-paper/65">
            <li><i className="mr-2 inline-block h-2 w-2 rounded-full bg-[#ff8a73]" />No hook</li>
            <li><i className="mr-2 inline-block h-2 w-2 rounded-full bg-paper" />Corvex</li>
            <li><i className="mr-2 inline-block h-2 w-2 rounded-full bg-[#6f95ff]" />Chainlink price, grey and dashed while dark</li>
            <li><i className="mr-2 inline-block h-2 w-2 rounded-full bg-[#2ee6a0]" />Filled at p*</li>
            <li><i className="mr-2 inline-block h-2 w-2 rounded-full bg-[#e0a030]" />Refunded</li>
          </ul>
        </section>

        <section className="mt-20">
          <h2 className="font-display text-4xl">What LPs lost</h2>
          <p className="mt-4 max-w-[60ch] text-slate">{scenario.note}</p>
          <div className="mt-8 max-w-[640px] rounded-2xl border border-line bg-paper-2 p-7">
            <LossBars key={sc} scenario={result} reveal={end} />
            {!end && <p className="mt-4 text-sm text-slate">Move the slider to the end to see the result.</p>}
          </div>
          <p className="mt-6 max-w-[70ch] text-sm text-slate">
            {replayCaveat} The end points above are measured. The price and P&amp;L paths between them are drawn to show the shape of the weekend.
          </p>
        </section>
      </main>
      <Footer />
    </>
  );
}
