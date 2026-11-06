"use client";

import { useEffect, useRef } from "react";
import { reducedMotion } from "@/lib/motion";

const fine = () => typeof window !== "undefined" && window.matchMedia("(pointer: fine)").matches && !reducedMotion();

/** A soft lime light that follows the cursor over the dark sections. */
export function CursorGlow() {
  const el = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!fine()) return;
    let x = -999, y = -999, tx = -999, ty = -999, raf = 0;
    const move = (e: PointerEvent) => {
      tx = e.clientX;
      ty = e.clientY;
      if (x === -999) {
        x = tx;
        y = ty;
      }
    };
    const tick = () => {
      x += (tx - x) * 0.12;
      y += (ty - y) * 0.12;
      if (el.current) el.current.style.transform = `translate3d(${x - 320}px, ${y - 320}px, 0)`;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    window.addEventListener("pointermove", move, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", move);
    };
  }, []);
  return <div ref={el} aria-hidden="true" className="pointer-events-none fixed left-0 top-0 z-30 h-[640px] w-[640px] rounded-full opacity-70 mix-blend-screen" style={{ background: "radial-gradient(closest-side, rgba(201,255,92,0.10), transparent)", transform: "translate3d(-999px,-999px,0)" }} />;
}

/** Pulls a button a little toward the cursor when it is close. */
export function Magnetic({ children, strength = 0.3 }: { children: React.ReactNode; strength?: number }) {
  const el = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const node = el.current;
    if (!node || !fine()) return;
    const move = (e: PointerEvent) => {
      const r = node.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2);
      const dy = e.clientY - (r.top + r.height / 2);
      const near = Math.hypot(dx, dy) < Math.max(r.width, r.height) * 0.9;
      node.style.transform = near ? `translate(${dx * strength}px, ${dy * strength}px)` : "translate(0,0)";
    };
    window.addEventListener("pointermove", move, { passive: true });
    return () => window.removeEventListener("pointermove", move);
  }, [strength]);
  return (
    <span ref={el} className="inline-block transition-transform duration-200 ease-out">
      {children}
    </span>
  );
}

/** Words that rise into place one after another when the page loads. */
export function RiseWords({ children, className = "", start = 0 }: { children: string; className?: string; start?: number }) {
  return (
    <span className={className}>
      {children.split(" ").map((w, i, all) => (
        <span key={i}>
          <span className="rise-word">
            <span style={{ animationDelay: `${120 + (start + i) * 90}ms` }}>{w}</span>
          </span>
          {i < all.length - 1 ? " " : ""}
        </span>
      ))}
    </span>
  );
}

/** A band of words that runs on its own. Pauses under the pointer. */
export function Marquee({ items }: { items: string[] }) {
  const row = [...items, ...items];
  return (
    <div className="group overflow-hidden bg-lime py-5 text-night" aria-hidden="true">
      <div className="marquee flex w-max items-center gap-10 whitespace-nowrap font-display text-3xl md:text-5xl">
        {row.map((t, i) => (
          <span key={i} className="flex items-center gap-10">
            {t}
            <i className="inline-block h-3 w-3 rounded-full bg-night" />
          </span>
        ))}
      </div>
    </div>
  );
}
