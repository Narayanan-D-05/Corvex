"use client";

import { useLayoutEffect, useRef, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

const steps = [
  { title: "Market closes", body: "Trades inside the 2% band still fill. Bigger ones wait." },
  { title: "Orders queue", body: "Large trades become claims in the queue. Nothing fills at Friday's price." },
  { title: "One cross", body: "Four checks pass. Buys and sells net at one reference price, and the surplus goes to LPs." },
  { title: "Gap auction", body: "What is left of the gap closes through a fee that starts at 5% and falls every block." },
];

const dots = Array.from({ length: 14 }, (_, i) => ({
  sx: 470 + (i % 5) * 26,
  sy: 60 + Math.floor(i / 5) * 34 + (i % 2) * 120,
  buy: i % 2 === 0,
}));

function Scene() {
  return (
    <svg viewBox="0 0 640 360" className="h-auto w-full" role="img" aria-label="Orders queue while the market is closed, then clear at one price">
      <rect x="0" y="0" width="640" height="360" rx="14" className="fill-night" />
      <rect className="dim" x="0" y="0" width="640" height="360" rx="14" fill="#5c6b82" opacity="0" />
      <line x1="30" x2="610" y1="215" y2="215" stroke="#e8edf3" strokeOpacity="0.35" strokeDasharray="4 6" />
      <text x="36" y="236" fill="#9fb0cc" fontSize="12" className="num">Friday close</text>
      <line className="pstar" x1="30" x2="610" y1="120" y2="120" stroke="#2650ff" strokeWidth="2" opacity="0" />
      <text className="pstar-label" x="36" y="108" fill="#8fa8ff" fontSize="12" opacity="0" style={{ fontFamily: "var(--font-jetbrains)" }}>
        p* = reference price
      </text>
      <path className="pool" d="M30 215 H610" stroke="#e8edf3" strokeWidth="3" fill="none" />
      {dots.map((d, i) => (
        <circle key={i} className="dot" data-i={i} cx={d.sx} cy={d.sy} r="6" fill={d.buy ? "#8fa8ff" : "#e8edf3"} opacity="0" />
      ))}
      <circle className="cross" cx="400" cy="120" r="12" fill="none" stroke="#2650ff" strokeWidth="3" opacity="0" />
    </svg>
  );
}

export function Story() {
  const root = useRef<HTMLElement>(null);
  const [animated, setAnimated] = useState(true);

  useLayoutEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setAnimated(false);
      return;
    }
    gsap.registerPlugin(ScrollTrigger);
    const ctx = gsap.context(() => {
      const q = gsap.utils.selector(root);
      const dotEls = q(".dot");
      const tl = gsap.timeline({
        defaults: { ease: "none" },
        scrollTrigger: { trigger: root.current, start: "top top", end: "+=3000", scrub: 0.6, pin: true },
      });
      const cap = q(".cap");
      gsap.set(cap, { autoAlpha: 0, y: 12 });
      gsap.set(cap[0], { autoAlpha: 1, y: 0 });

      const show = (i: number, at: string | number) => {
        cap.forEach((c, k) => tl.to(c, { autoAlpha: k === i ? 1 : 0, y: k === i ? 0 : -12, duration: 0.25 }, at));
      };
      tl.to(q(".dim"), { opacity: 0.28, duration: 1 }, 0);
      tl.to(dotEls, { opacity: 1, duration: 0.6, stagger: 0.04 }, 1.2);
      show(1, 1.2);
      tl.to(q(".pstar"), { opacity: 1, duration: 0.5 }, 3);
      tl.to(q(".pstar-label"), { opacity: 1, duration: 0.5 }, 3);
      dotEls.forEach((d) => tl.to(d, { attr: { cx: 400 + (Math.random() - 0.5) * 14, cy: 120 + (Math.random() - 0.5) * 14 }, duration: 1.2 }, 3.4));
      tl.to(q(".cross"), { opacity: 1, duration: 0.4 }, 4.4);
      show(2, 3.4);
      tl.to(q(".dim"), { opacity: 0, duration: 0.8 }, 4.4);
      tl.to(dotEls, { opacity: 0, duration: 0.5 }, 5);
      tl.to(q(".pool"), { attr: { d: "M30 215 C 220 215, 380 120, 610 120" }, duration: 1.6 }, 5.2);
      show(3, 5.2);
      tl.to({}, { duration: 0.8 });
    }, root);
    return () => ctx.revert();
  }, []);

  return (
    <section id="how" ref={root} className="relative bg-paper-2">
      <div className="mx-auto grid min-h-screen max-w-[1100px] items-center gap-10 px-4 py-20 md:grid-cols-[1fr_1.25fr]">
        <div className="relative min-h-[11rem]">
          <h2 className="font-display text-5xl leading-[1.02] md:text-6xl">How a cross works</h2>
          <div className="relative mt-8 min-h-[9rem]">
            {steps.map((s, i) => (
              <div key={s.title} className={`cap ${animated ? "absolute inset-x-0 top-0" : "mb-6"}`}>
                <h3 className="text-xl font-semibold">{s.title}</h3>
                <p className="mt-2 max-w-[38ch] text-slate">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
        <Scene />
      </div>
    </section>
  );
}
