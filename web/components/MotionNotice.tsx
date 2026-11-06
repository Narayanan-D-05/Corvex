"use client";

import { useEffect, useState } from "react";
import { forceMotionOn, motionForcedOn, osWantsReducedMotion } from "@/lib/motion";

/** If the system asks for reduced motion, say why the page is still and offer a way to turn the animations on. */
export function MotionNotice() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (motionForcedOn()) document.documentElement.classList.add("motion-on");
    else setShow(osWantsReducedMotion());
  }, []);

  if (!show) return null;
  return (
    <div role="status" className="fixed bottom-4 right-4 z-[60] flex max-w-[22rem] items-center gap-3 rounded-xl border border-white/15 bg-[#0e1f19]/95 px-4 py-3 text-sm text-snow shadow-xl backdrop-blur">
      <span className="text-snow/80">Animations are off because your system asks for reduced motion.</span>
      <button
        onClick={() => {
          forceMotionOn();
          window.location.reload();
        }}
        className="tag shrink-0 rounded-md bg-lime px-3 py-2 text-night"
      >
        Turn on
      </button>
    </div>
  );
}
