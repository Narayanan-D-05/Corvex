"use client";

import { useEffect, useRef, useState } from "react";
import type { Scenario } from "@/lib/replay";

const rows = [
  { key: "noHook", label: "No hook" },
  { key: "feeOnly", label: "Fee-only hook" },
  { key: "corvex", label: "Corvex" },
] as const;

/** LP PnL after the weekend, as bars from a zero line. Bars grow once when scrolled into view. */
export function LossBars({ scenario, reveal = true }: { scenario: Scenario; reveal?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && (setSeen(true), io.disconnect()), { threshold: 0.3 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const max = Math.max(...rows.map((r) => Math.abs(scenario.pnl[r.key])), 1);
  const on = seen && reveal;

  return (
    <div ref={ref} className="space-y-5">
      {rows.map((r) => {
        const v = scenario.pnl[r.key];
        const w = (Math.abs(v) / max) * 50;
        const neg = v < 0;
        return (
          <div key={r.key} className="grid grid-cols-[7.5rem_1fr_6rem] items-center gap-3">
            <span className={`text-sm ${r.key === "corvex" ? "font-semibold" : "text-slate"}`}>{r.label}</span>
            <div className="relative h-7">
              <div className="absolute inset-y-0 left-1/2 w-px bg-line" />
              <div
                className={`absolute top-0 h-full transition-[width] duration-700 ease-out ${neg ? "right-1/2 rounded-l-sm" : "left-1/2 rounded-r-sm"} ${
                  r.key === "corvex" ? "bg-cobalt" : neg ? "bg-rose/80" : "bg-mint/80"
                }`}
                style={{ width: on ? `${w}%` : "0%" }}
              />
            </div>
            <span className="num text-right text-sm">
              {v > 0 ? "+" : v < 0 ? "-" : ""}
              {Math.abs(v).toFixed(2)}
            </span>
          </div>
        );
      })}
      <p className="text-sm text-slate">LP PnL in USDG on a 400,000 USDG pool, marked at the reopen price.</p>
    </div>
  );
}
