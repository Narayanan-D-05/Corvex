"use client";

import { useEffect, useRef, useState } from "react";
import { reducedMotion } from "@/lib/motion";

/**
 * Time for a looping demo: it plays by itself, no scrolling needed. `paused` holds the current frame.
 * With reduced motion it rests on one finished frame instead.
 */
export function useCycle(period: number, paused = false, start = 0) {
  const [u, setU] = useState(start);
  const [still, setStill] = useState(false);
  const pos = useRef(start);

  useEffect(() => {
    const reduce = reducedMotion();
    setStill(reduce);
    if (reduce) setU(0.9);
  }, []);

  useEffect(() => {
    if (still || paused) return;
    let raf = 0;
    let last = performance.now();
    let acc = pos.current;
    const tick = (now: number) => {
      acc = (acc + (now - last) / (period * 1000)) % 1;
      last = now;
      pos.current = acc;
      // about 20 updates a second is plenty for a status table
      setU((prev) => (Math.abs(acc - prev) > 0.004 || acc < prev ? acc : prev));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [period, paused, still]);

  return { u, still };
}
