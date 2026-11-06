"use client";

import { useEffect, useRef } from "react";
import { reducedMotion } from "@/lib/motion";

/**
 * A card that is drawn toward the cursor. Anywhere on the page it turns to face the pointer; when the pointer
 * gets close it also slides toward it, leans in and lifts. It springs back to rest when the pointer goes away.
 */
export function Tilt({ children, max = 10, reach = 420, className = "" }: { children: React.ReactNode; max?: number; reach?: number; className?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const glare = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = box.current;
    if (!el || reducedMotion() || !window.matchMedia("(pointer: fine)").matches) return;
    let raf = 0;
    const target = { rx: 0, ry: 0, dx: 0, dy: 0, s: 1, gx: 50, gy: 30 };
    const cur = { rx: 0, ry: 0, dx: 0, dy: 0, s: 1 };
    let idle = 0;

    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const vx = (e.clientX - cx) / (r.width / 2);
      const vy = (e.clientY - cy) / (r.height / 2);
      // distance from the card's edge: 0 over the card, growing as the pointer leaves it
      const ex = Math.max(Math.abs(e.clientX - cx) - r.width / 2, 0);
      const ey = Math.max(Math.abs(e.clientY - cy) - r.height / 2, 0);
      const near = Math.max(0, 1 - Math.hypot(ex, ey) / reach);
      const lean = 0.35 + near * 0.9;
      target.ry = Math.max(-1.6, Math.min(1.6, vx)) * max * lean;
      target.rx = -Math.max(-1.6, Math.min(1.6, vy)) * max * lean;
      target.dx = Math.max(-1.5, Math.min(1.5, vx)) * near * 34;
      target.dy = Math.max(-1.5, Math.min(1.5, vy)) * near * 26;
      target.s = 1 + near * 0.03;
      target.gx = Math.max(0, Math.min(100, ((e.clientX - r.left) / r.width) * 100));
      target.gy = Math.max(0, Math.min(100, ((e.clientY - r.top) / r.height) * 100));
      idle = performance.now();
    };
    const rest = () => {
      target.rx = target.ry = target.dx = target.dy = 0;
      target.s = 1;
    };

    const tick = (now: number) => {
      // with no pointer movement for a while the card settles and sways gently on its own
      const sway = now - idle > 2500;
      const k = 0.09;
      const t = now / 1000;
      const tx = sway ? Math.sin(t * 0.8) * 3 : target.rx;
      const ty = sway ? Math.cos(t * 0.6) * 4 : target.ry;
      const tdx = sway ? 0 : target.dx;
      const tdy = sway ? 0 : target.dy;
      cur.rx += (tx - cur.rx) * k;
      cur.ry += (ty - cur.ry) * k;
      cur.dx += (tdx - cur.dx) * k;
      cur.dy += (tdy - cur.dy) * k;
      cur.s += ((sway ? 1 : target.s) - cur.s) * k;
      el.style.transform = `perspective(1100px) translate3d(${cur.dx.toFixed(1)}px, ${cur.dy.toFixed(1)}px, 0) rotateX(${cur.rx.toFixed(2)}deg) rotateY(${cur.ry.toFixed(2)}deg) scale(${cur.s.toFixed(4)})`;
      if (glare.current) glare.current.style.background = `radial-gradient(520px circle at ${target.gx}% ${target.gy}%, rgba(201,255,92,0.16), transparent 55%)`;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    window.addEventListener("pointermove", onMove, { passive: true });
    document.documentElement.addEventListener("pointerleave", rest);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
      document.documentElement.removeEventListener("pointerleave", rest);
    };
  }, [max, reach]);

  return (
    <div ref={box} className={`relative will-change-transform ${className}`} style={{ transformStyle: "preserve-3d" }}>
      {children}
      <div ref={glare} aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-2xl" />
    </div>
  );
}
