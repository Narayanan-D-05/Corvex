"use client";

import { useEffect, useRef, useState } from "react";

const stats = [
  {
    value: 97.6,
    suffix: "%",
    label: "of SPY's long-run gain arrived between the close and the open.",
    source: "The Standard Reserve, Isolated Exposure Tokens (Oct 2026), quoting third-party analyses. Not recomputed.",
    href: "https://x.com/standard_rsv/status/2118336446461587545",
  },
  {
    value: 56,
    suffix: "%",
    label: "of weekend stock-token volume on Robinhood Chain went through Reserve-owned pools.",
    source: "The Standard Reserve on X, Nov 5 2026. Self-reported.",
    href: "https://x.com/standard_rsv/status/2118336446461587545",
  },
  {
    value: 73,
    suffix: "%",
    label: "of stock-token DEX liquidity on Robinhood Chain sits in Uniswap v4.",
    source: "Crypto Briefing.",
    href: "https://cryptobriefing.com/uniswap-v4-dominates-robinhood-chain-tokenized-stocks/",
  },
];

function useInView<T extends Element>() {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    if (ref.current) setSeen(true);
  }, []);
  return [ref, seen] as const;
}

function CountUp({ to, suffix }: { to: number; suffix: string }) {
  const [ref, seen] = useInView<HTMLSpanElement>();
  const [v, setV] = useState(0);
  useEffect(() => {
    if (!seen) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return setV(to);
    const t0 = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / 1100);
      setV(to * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [seen, to]);
  return (
    <span ref={ref} className="tabular-nums">
      {v.toFixed(to % 1 ? 1 : 0)}
      {suffix}
    </span>
  );
}

export function Problem() {
  return (
    <section className="bg-paper text-ink">
      <div className="mx-auto max-w-[1200px] px-6 py-28">
        <p className="tag text-mint">[ The problem ]</p>
        <h2 className="mt-5 max-w-[18ch] font-display text-5xl leading-[1.02] md:text-7xl">The market opens. The first bot to arrive takes the gap.</h2>
        <p className="mt-6 max-w-[56ch] text-lg text-slate">
          Stock tokens trade all weekend against Friday&apos;s price. Monday&apos;s news lands in one jump, and liquidity providers pay for it.
        </p>
        <div className="mt-16 grid gap-10 md:grid-cols-3">
          {stats.map((s) => (
            <figure key={s.value} className="border-t border-ink/20 pt-6">
              <div className="font-display text-7xl leading-none">
                <CountUp to={s.value} suffix={s.suffix} />
              </div>
              <figcaption className="mt-4 max-w-[30ch] text-base">{s.label}</figcaption>
              <a href={s.href} target="_blank" rel="noreferrer" className="mt-3 block text-sm text-slate underline-offset-4 hover:underline">
                {s.source}
              </a>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}
