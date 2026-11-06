/** Whether to hold still. The system setting wins unless the visitor turned animations on here. */
const KEY = "corvex.motion";

export function osWantsReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function motionForcedOn(): boolean {
  try {
    return typeof window !== "undefined" && window.localStorage.getItem(KEY) === "on";
  } catch {
    return false;
  }
}

export function reducedMotion(): boolean {
  return osWantsReducedMotion() && !motionForcedOn();
}

export function forceMotionOn() {
  try {
    window.localStorage.setItem(KEY, "on");
  } catch {
    /* private mode: the page just reloads still */
  }
}
