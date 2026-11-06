"use client";

import { useEffect, useRef, useState } from "react";

const clamp = (x: number) => Math.min(1, Math.max(0, x));
const sstep = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * Time for the animation: loops by itself, no scrolling needed. `from` lets a view start part way through the cycle.
 * With reduced motion it holds one still frame instead.
 */
export function useCycle(period: number, { from = 0, paused = false }: { from?: number; paused?: boolean } = {}) {
  const [u, setU] = useState(from);
  const [still, setStill] = useState(false);
  const base = useRef(0);
  useEffect(() => setStill(window.matchMedia("(prefers-reduced-motion: reduce)").matches), []);
  useEffect(() => {
    if (still) return setU(0.72);
    if (paused) return;
    let raf = 0;
    const t0 = performance.now() - ((u - from) / (1 - from)) * period * 1000;
    base.current = t0;
    const tick = (now: number) => {
      setU(from + (((now - base.current) / (period * 1000)) % 1) * (1 - from));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // u is read once to resume where it stopped
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, from, paused, still]);
  return { u, setU, still };
}

/** The phases of a cross, as the thresholds the visual and the captions share. */
export const PHASE = { queue: 0.04, match: 0.46, matched: 0.62, pool: 0.64, surplus: 0.8 };

export function caption(u: number, buys: number, sells: number, instant: boolean): string {
  const m = Math.min(buys, sells);
  const net = Math.abs(buys - sells);
  const side = buys >= sells ? "buys" : "sells";
  if (instant) return "The market is open. Every trade swaps against the pool right away, at the live price.";
  if (u < PHASE.queue) return "The market is closed. Large orders will wait instead of trading at Friday's price.";
  if (u < PHASE.match) return `${buys} buys and ${sells} sells wait in the queue. Nothing fills at a stale price.`;
  if (u < PHASE.pool) return `The market reopens. ${m} buys are matched against ${m} sells at one price, p*, with no pool and no fee.`;
  if (u < PHASE.surplus) return net ? `Only the ${net} left-over ${side} swap against the Uniswap v4 pool, and never past p*.` : "Buys and sells cancel out, so the pool is not touched.";
  return "Whatever the pool leg saved against p* is donated to LPs. A falling fee then closes any remaining gap.";
}

const BLOCK = 22;
const GAP = 28;
const BUY = "#7ea0ff";
const SELL = "#eef2fa";
const MINT = "#2ee6a0";

function home(side: "buy" | "sell", i: number) {
  const col = i % 4;
  const row = Math.floor(i / 4);
  const y = 300 - row * GAP;
  return side === "buy" ? { x: 70 + col * GAP, y } : { x: 730 - BLOCK - col * GAP, y };
}

type Block = { x: number; y: number; s: number; o: number; fill: string };

function place(side: "buy" | "sell", i: number, n: number, matched: number, u: number, instant: boolean): Block {
  const h = home(side, i);
  const arrive = 0.04 + (0.3 * i) / Math.max(1, n - 1);
  const a = sstep(arrive, arrive + 0.06, u);
  let x = h.x + (side === "buy" ? -70 : 70) * (1 - a);
  let y = h.y;
  let s = 1;
  let o = a;
  let fill = side === "buy" ? BUY : SELL;

  if (instant) {
    // each order goes straight into the pool
    const go = sstep(arrive + 0.08, arrive + 0.2, u);
    const tx = 340 + (i % 8) * 20;
    x = lerp(x, tx, go);
    y = lerp(y, 372, go) - Math.sin(Math.PI * go) * 40;
    o *= 1 - sstep(arrive + 0.2, arrive + 0.26, u);
    s = 1 - 0.4 * go;
    return { x, y, s, o, fill };
  }

  if (i < matched) {
    const e = sstep(PHASE.match, PHASE.matched, u);
    // matched orders settle in a small grid inside the ring, buys on the left half and sells on the right
    const col = i % 3;
    const row = Math.floor(i / 3);
    const rows = Math.ceil(matched / 3);
    const tx = side === "buy" ? 400 - 12 - BLOCK - col * 24 : 400 + 12 + col * 24;
    const ty = 150 - (rows * 24) / 2 + row * 24 + 1;
    x = lerp(x, tx, e);
    y = lerp(y, ty, e);
    if (u > PHASE.match + 0.06) fill = MINT;
    const out = sstep(PHASE.matched, 0.7, u);
    s = 1 - out;
    o *= 1 - out * 0.4;
  } else {
    const q = i - matched;
    const e = sstep(PHASE.pool, PHASE.surplus, u);
    const tx = 336 + (q % 8) * 20;
    const ty = 360 + Math.floor(q / 8) * 16;
    x = lerp(x, tx, e);
    y = lerp(y, ty, e) - Math.sin(Math.PI * e) * 60;
    s = 1 - 0.45 * e;
    o *= 1 - sstep(PHASE.surplus, 0.86, u);
  }
  return { x, y, s, o: o * (1 - sstep(0.96, 1, u)), fill };
}

/** How the cross works, drawn: buys and sells wait, match each other, and only the left-over trades against the pool. */
export function CrossMachine({ u, buys, sells, instant = false }: { u: number; buys: number; sells: number; instant?: boolean }) {
  const B = Math.min(buys, 24);
  const S = Math.min(sells, 24);
  const M = instant ? 0 : Math.min(B, S);
  const n = Math.max(B, S, 1);
  const ring = instant ? 0.25 : sstep(PHASE.queue, PHASE.match, u) * 0.5 + sstep(PHASE.match - 0.04, PHASE.matched, u) * 0.5;
  const flash = Math.max(0, 1 - Math.abs(u - (PHASE.match + 0.08)) / 0.07);
  const ripple = instant ? 0.6 : sstep(PHASE.pool, 0.72, u) * (1 - sstep(PHASE.surplus, 0.9, u));
  const amp = 2.5 + ripple * 7;
  const wave = Array.from({ length: 33 }, (_, k) => {
    const x = 240 + (k / 32) * 320;
    return `${k ? "L" : "M"}${x} ${346 + Math.sin(k * 0.6 + u * 40) * amp}`;
  }).join(" ");
  const coins = !instant && u > PHASE.surplus ? Array.from({ length: 6 }, (_, k) => ({ k, p: sstep(PHASE.surplus + k * 0.018, PHASE.surplus + 0.12 + k * 0.018, u) })) : [];
  const out = 1 - sstep(0.96, 1, u);

  return (
    <svg viewBox="0 0 800 480" className="h-auto w-full" role="img" aria-label="Buys and sells queue, match each other at one price, and only the left-over trades against the pool">
      <defs>
        <radialGradient id="cm-glow">
          <stop offset="0" stopColor="#8fa8ff" stopOpacity="0.8" />
          <stop offset="1" stopColor="#8fa8ff" stopOpacity="0" />
        </radialGradient>
      </defs>
      <g fontFamily="var(--font-bricolage), system-ui, sans-serif" fontSize="14" fill="#9fb0cc">
        <text x="70" y="44">Buys waiting</text>
        <text x="730" y="44" textAnchor="end">Sells waiting</text>
      </g>

      {/* the cross */}
      <circle cx="400" cy="150" r={110} fill="url(#cm-glow)" opacity={flash * 0.9} />
      <circle cx="400" cy="150" r={64} fill="none" stroke="#2650ff" strokeWidth="3" opacity={0.25 + ring * 0.75} strokeDasharray={instant ? "6 8" : undefined} />
      <circle cx="400" cy="150" r={42} fill="none" stroke="#8fa8ff" strokeWidth="1.5" opacity={0.15 + ring * 0.6} />
      <text x="400" y="156" textAnchor="middle" fontSize="20" fontWeight="600" fill="#eef2fa" opacity={0.4 + ring * 0.6} fontFamily="var(--font-jetbrains), monospace">
        {instant ? "live" : "p*"}
      </text>
      <text x="400" y="240" textAnchor="middle" fontSize="13" fill="#9fb0cc" fontFamily="var(--font-bricolage), system-ui, sans-serif" opacity={0.4 + ring * 0.6}>
        {instant ? "market open" : "one price for everyone"}
      </text>

      {/* orders */}
      {Array.from({ length: B }, (_, i) => {
        const b = place("buy", i, n, M, u, instant);
        return <rect key={`b${i}`} x={b.x + (BLOCK * (1 - b.s)) / 2} y={b.y + (BLOCK * (1 - b.s)) / 2} width={BLOCK * b.s} height={BLOCK * b.s} rx="4" fill={b.fill} opacity={b.o} />;
      })}
      {Array.from({ length: S }, (_, i) => {
        const b = place("sell", i, n, M, u, instant);
        return <rect key={`s${i}`} x={b.x + (BLOCK * (1 - b.s)) / 2} y={b.y + (BLOCK * (1 - b.s)) / 2} width={BLOCK * b.s} height={BLOCK * b.s} rx="4" fill={b.fill} opacity={b.o} />;
      })}

      {/* the Uniswap v4 pool */}
      <rect x="240" y="334" width="320" height="82" rx="14" fill="#0f2147" stroke="#2650ff" strokeOpacity="0.6" />
      <path d={`${wave} L560 416 L240 416 Z`} fill="#2650ff" opacity="0.28" />
      <path d={wave} fill="none" stroke="#6f95ff" strokeWidth="2" />
      <text x="400" y="406" textAnchor="middle" fontSize="13" fill="#c8d4ee" fontFamily="var(--font-bricolage), system-ui, sans-serif">Uniswap v4 pool</text>

      {/* surplus to LPs */}
      {coins.map(({ k, p }) => (
        <circle key={k} cx={364 + k * 14} cy={lerp(416, 452, p)} r={5} fill={MINT} opacity={(1 - sstep(0.9, 0.96, p)) * out * sstep(0, 0.2, p)} />
      ))}
      <text x="400" y="470" textAnchor="middle" fontSize="13" fill={MINT} opacity={(!instant && u > PHASE.surplus ? sstep(PHASE.surplus + 0.05, PHASE.surplus + 0.12, u) : 0) * out} fontFamily="var(--font-bricolage), system-ui, sans-serif">
        surplus donated to LPs
      </text>
    </svg>
  );
}
