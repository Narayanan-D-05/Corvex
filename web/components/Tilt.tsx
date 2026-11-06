"use client";

import { useEffect, useRef } from "react";

/**
 * Turns toward the cursor in 3D and drifts a little towards it, with a soft glare.
 * It follows the pointer anywhere on the page, eases back to rest when the pointer leaves, and stays flat with reduced motion.
 */
export function Tilt({ children, max = 9, className = "" }: { children: React.ReactNode; max?: number; className?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const glare = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = box.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches || !window.matchMedia("(pointer: fine)").matches) return;
    let tx = 0, ty = 0, x = 0, y = 0, raf = 0;
    const target = { rx: 0, ry: 0, dx: 0, dy: 0, gx: 50, gy: 30 };
    const cur = { rx: 0, ry: 0, dx: 0, dy: 0 };

    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      // -1 to 1 across the screen, so the card keeps turning even when the cursor is far away
      tx = Math.max(-1, Math.min(1, (e.clientX - cx) / (window.innerWidth / 2)));
      ty = Math.max(-1, Math.min(1, (e.clientY - cy) / (window.innerHeight / 2)));
      target.ry = tx * max;
      target.rx = -ty * max;
      target.dx = tx * 14;
      target.dy = ty * 10;
      target.gx = Math.max(0, Math.min(100, ((e.clientX - r.left) / r.width) * 100));
      target.gy = Math.max(0, Math.min(100, ((e.clientY - r.top) / r.height) * 100));
    };
    const onLeave = () => {
      target.rx = target.ry = target.dx = target.dy = 0;
    };

    const tick = () => {
      cur.rx += (target.rx - cur.rx) * 0.1;
      cur.ry += (target.ry - cur.ry) * 0.1;
      cur.dx += (target.dx - cur.dx) * 0.1;
      cur.dy += (target.dy - cur.dy) * 0.1;
      x = cur.dx;
      y = cur.dy;
      el.style.transform = `perspective(1100px) translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) rotateX(${cur.rx.toFixed(2)}deg) rotateY(${cur.ry.toFixed(2)}deg)`;
      if (glare.current) glare.current.style.background = `radial-gradient(520px circle at ${target.gx}% ${target.gy}%, rgba(201,255,92,0.14), transparent 55%)`;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    window.addEventListener("pointermove", onMove, { passive: true });
    document.documentElement.addEventListener("pointerleave", onLeave);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
      document.documentElement.removeEventListener("pointerleave", onLeave);
    };
  }, [max]);

  return (
    <div ref={box} className={`relative will-change-transform ${className}`} style={{ transformStyle: "preserve-3d" }}>
      {children}
      <div ref={glare} aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-2xl" />
    </div>
  );
}
