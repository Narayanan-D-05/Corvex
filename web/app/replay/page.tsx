"use client";

import { useState } from "react";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Sections";
import { LossBars } from "@/components/LossBars";
import { replayCaveat, scenarios } from "@/lib/replay";

const stages = [
  { label: "Friday close", mode: "Normal", queue: 0, line: "The close print is recorded at $200.", price: 200, ref: 200 },
  { label: "Weekend", mode: "Dark", queue: 3, line: "Large trades queue as claims. Small ones still fill inside the band.", price: 200, ref: 200 },
  { label: "Monday 13:30", mode: "Awaiting reopen", queue: 3, line: "The feed is back. Swaps revert until the cross runs.", price: 200, ref: 212 },
  { label: "The cross", mode: "Auction", queue: 0, line: "One price for the whole queue. Surplus goes to LPs.", price: 212, ref: 212 },
  { label: "Settled", mode: "Normal", queue: 0, line: "Fees from the auction go to LPs. Trading is normal again.", price: 212, ref: 212 },
];

export default function Replay() {
  const [i, setI] = useState(0);
  const [sc, setSc] = useState(0);
  const st = stages[i];
  const lo = 195, hi = 217;
  const y = (p: number) => 150 - ((p - lo) / (hi - lo)) * 130;

  return (
    <>
      <Navbar alwaysSolid />
      <main className="mx-auto max-w-[1100px] px-4 pb-24 pt-32">
        <h1 className="font-display text-6xl leading-none md:text-7xl">Replay</h1>
        <p className="mt-5 max-w-[58ch] text-lg text-slate">
          One split weekend, step by step. Drag the slider to move through it.
        </p>

        <section className="mt-12 grid gap-10 lg:grid-cols-[1.1fr_1fr]">
          <div className="rounded-2xl bg-night p-6 text-paper">
            <svg viewBox="0 0 400 170" className="h-auto w-full" role="img" aria-label={`Pool price ${st.price}, reference ${st.ref}`}>
              <line x1="10" x2="390" y1={y(st.ref)} y2={y(st.ref)} stroke="#2650ff" strokeWidth="2" style={{ transition: "all 300ms ease" }} />
              <text x="14" y={y(st.ref) - 6} fill="#8fa8ff" fontSize="10" style={{ fontFamily: "var(--font-jetbrains)" }}>reference ${st.ref}</text>
              <line x1="10" x2="390" y1={y(st.price)} y2={y(st.price)} stroke="#e8edf3" strokeWidth="3" style={{ transition: "all 300ms ease" }} />
              <text x="14" y={y(st.price) + 16} fill="#e8edf3" fontSize="10" style={{ fontFamily: "var(--font-jetbrains)" }}>pool ${st.price}</text>
              {Array.from({ length: st.queue }).map((_, k) => (
                <circle key={k} cx={330 + k * 14} cy={y(200) - 18} r="5" fill="#8fa8ff" />
              ))}
            </svg>
            <div className="mt-5">
              <input aria-label="Replay position" type="range" min={0} max={stages.length - 1} value={i} onChange={(e) => setI(Number(e.target.value))} className="w-full accent-[#2650ff]" />
              <div className="mt-2 flex justify-between text-xs text-paper/60">
                {stages.map((s, k) => <button key={s.label} onClick={() => setI(k)} className={k === i ? "text-paper" : ""}>{s.label}</button>)}
              </div>
            </div>
          </div>
          <div>
            <div className="flex items-center gap-3"><span className="rounded-md bg-paper-2 px-3 py-1 text-sm font-semibold">{st.mode}</span><span className="text-sm text-slate">{st.queue} queued</span></div>
            <h2 className="mt-4 font-display text-4xl leading-tight">{st.label}</h2>
            <p className="mt-3 max-w-[40ch] text-slate">{st.line}</p>
          </div>
        </section>

        <section className="mt-20">
          <h2 className="font-display text-4xl">What LPs lost</h2>
          <div className="mt-5 flex gap-2" role="group" aria-label="Scenario">
            {scenarios.map((s, k) => (
              <button key={s.id} onClick={() => setSc(k)} aria-pressed={sc === k} className={`rounded-lg border px-4 py-2 text-sm ${sc === k ? "border-ink bg-ink text-paper" : "border-line"}`}>{s.title}</button>
            ))}
          </div>
          <p className="mt-4 max-w-[60ch] text-slate">{scenarios[sc].note}</p>
          <div className="mt-8 max-w-[640px] rounded-2xl border border-line bg-paper-2 p-7">
            <LossBars key={sc} scenario={scenarios[sc]} reveal={i === stages.length - 1} />
            {i !== stages.length - 1 && <p className="mt-4 text-sm text-slate">Move the slider to Settled to see the result.</p>}
          </div>
          <p className="mt-6 max-w-[70ch] text-sm text-slate">{replayCaveat}</p>
        </section>
      </main>
      <Footer />
    </>
  );
}
