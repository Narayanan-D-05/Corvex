"use client";

import dynamic from "next/dynamic";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

const CrossScene = dynamic(() => import("./CrossScene"), { ssr: false });

const steps = [
  { title: "Market closes", body: "Trades inside the 2% band still fill. Bigger ones wait.", from: 0 },
  { title: "Orders queue", body: "Large trades become claims in the queue. Nothing fills at Friday's price.", from: 0.22 },
  { title: "One cross", body: "Four checks pass. Buys and sells net at one reference price, and the surplus goes to LPs.", from: 0.5 },
  { title: "Gap auction", body: "What is left of the gap closes through a fee that starts at 5% and falls every block.", from: 0.76 },
];

const stepAt = (p: number) => steps.reduce((acc, s, i) => (p >= s.from ? i : acc), 0);

export function Story() {
  const root = useRef<HTMLElement>(null);
  const progress = useRef(0.66);
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
      end: "+=3600",
      pin: true,
      scrub: 0.5,
      onUpdate: (self) => {
        progress.current = self.progress;
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
      <div className="absolute inset-0 -z-10" aria-hidden="true">
        {mounted && <CrossScene progress={progress} still={!animated} />}
      </div>
      <div className="mx-auto grid min-h-screen max-w-[1100px] items-center px-4 py-20 md:grid-cols-[1fr_1.25fr]">
        <div>
          <h2 className="font-display text-5xl leading-[1.02] md:text-6xl">How a cross works</h2>
          <div className="relative mt-8 min-h-[9rem]">
            {steps.map((s, i) => (
              <div
                key={s.title}
                aria-hidden={animated && active !== i}
                className={`${animated ? "absolute inset-x-0 top-0 transition-all duration-500" : "mb-6"} ${
                  animated && active !== i ? "pointer-events-none translate-y-3 opacity-0" : "translate-y-0 opacity-100"
                }`}
              >
                <h3 className="text-xl font-semibold">{s.title}</h3>
                <p className="mt-2 max-w-[38ch] text-paper/75">{s.body}</p>
              </div>
            ))}
          </div>
          {animated && (
            <div className="mt-10 flex items-center gap-2" aria-hidden="true">
              {steps.map((s, i) => (
                <span key={s.title} className={`h-1 rounded-full transition-all duration-500 ${i === active ? "w-10 bg-cobalt" : i < active ? "w-6 bg-paper/50" : "w-6 bg-paper/20"}`} />
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
