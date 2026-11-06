"use client";

import dynamic from "next/dynamic";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

const WeekendScene = dynamic(() => import("./WeekendScene"), { ssr: false });

const steps = [
  { title: "Market closes", body: "Trades inside the 2% band still fill. Bigger ones wait.", from: 0, when: "Friday close" },
  { title: "Orders queue", body: "Large trades become claims in the queue. Nothing fills at Friday's price.", from: 0.14, when: "Saturday and Sunday" },
  { title: "One cross", body: "Four checks pass. Buys and sells net at one reference price, and the surplus goes to LPs.", from: 0.84, when: "Monday open" },
  { title: "Gap auction", body: "What is left of the gap closes through a fee that starts at 5% and falls every block.", from: 0.92, when: "Minutes after the open" },
];

const stepAt = (p: number) => steps.reduce((acc, s, i) => (p >= s.from ? i : acc), 0);

export function Story() {
  const root = useRef<HTMLElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  const progress = useRef(0.99);
  const [animated, setAnimated] = useState(true);
  const [active, setActive] = useState(0);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useLayoutEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setAnimated(false);
      return;
    }
    progress.current = 0;
    gsap.registerPlugin(ScrollTrigger);
    const st = ScrollTrigger.create({
      trigger: root.current,
      start: "top top",
      end: "+=4200",
      pin: true,
      scrub: 0.6,
      onUpdate: (self) => {
        progress.current = self.progress;
        if (bar.current) bar.current.style.transform = `scaleX(${self.progress})`;
        setActive((a) => {
          const n = stepAt(self.progress);
          return n === a ? a : n;
        });
      },
    });
    return () => st.kill();
  }, []);

  return (
    <section id="how" ref={root} className="relative isolate overflow-hidden bg-night text-paper">
      <div className="mx-auto grid min-h-screen max-w-[1100px] items-center gap-10 px-4 py-20 md:grid-cols-[0.85fr_1.35fr]">
        <div>
          <h2 className="font-display text-5xl leading-[1.02] md:text-6xl">How a cross works</h2>
          <ol className="mt-10 space-y-1">
            {steps.map((s, i) => {
              const on = !animated || i === active;
              return (
                <li key={s.title} className={`relative border-l-2 py-3 pl-6 transition-colors duration-500 ${on ? "border-cobalt" : i < active ? "border-paper/40" : "border-paper/15"}`}>
                  <span className={`absolute -left-[7px] top-[1.15rem] h-3 w-3 rounded-full transition-colors duration-500 ${on ? "bg-cobalt" : i < active ? "bg-paper/50" : "bg-night ring-2 ring-paper/20"}`} />
                  <div className={`transition-opacity duration-500 ${on || i < active ? "opacity-100" : "opacity-45"}`}>
                    <div className="flex items-baseline justify-between gap-4">
                      <h3 className="text-lg font-semibold">{s.title}</h3>
                      <span className="text-xs text-paper/55">{s.when}</span>
                    </div>
                    <div className={`grid transition-all duration-500 ${on ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
                      <p className="max-w-[40ch] overflow-hidden pt-1 text-paper/75">{s.body}</p>
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
        <div className="overflow-hidden rounded-2xl border border-paper/15 bg-night shadow-[0_30px_80px_-30px_rgba(38,80,255,0.55)]">
          <div className="relative aspect-[4/3] w-full md:aspect-[16/11]" aria-hidden="true">
            {mounted && <WeekendScene progress={progress} mode="scrub" still={!animated} />}
          </div>
          <div className="flex items-center gap-5 border-t border-paper/10 px-5 py-3 text-xs text-paper/70">
            <span className="flex items-center gap-2"><i className="h-2 w-2 rounded-full bg-[#ff8a73]" />No hook</span>
            <span className="flex items-center gap-2"><i className="h-2 w-2 rounded-full bg-paper" />Corvex</span>
            <span className="flex items-center gap-2"><i className="h-2 w-2 rounded-full bg-[#6f95ff]" />Chainlink price</span>
            <span className="flex items-center gap-2"><i className="h-2 w-2 rounded-full bg-[#2ee6a0]" />Filled</span>
            {animated && (
              <div className="ml-auto h-1 w-24 overflow-hidden rounded-full bg-paper/15">
                <div ref={bar} className="h-full origin-left bg-cobalt" style={{ transform: "scaleX(0)" }} />
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
