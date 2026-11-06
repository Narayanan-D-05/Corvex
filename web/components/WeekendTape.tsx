"use client";

import { useEffect, useRef, useState } from "react";
import { BAND, CLOSE_PRICE, CROSS, OPEN_PRICE, P_STAR, at, orderAt, queueAt, type WeekendOrder, type WeekendScenario } from "@/lib/weekend";

const W = 800;
const L = 56;
const R = 18;
const x = (t: number) => L + t * (W - L - R);
const C = { rose: "#ff8a73", paper: "#eef2fa", blue: "#6f95ff", grey: "#8794ad", mint: "#2ee6a0", amber: "#e0a030", grid: "rgba(238,242,250,0.09)" };
const FAIR = [[0, CLOSE_PRICE], [CROSS - 0.005, CLOSE_PRICE], [CROSS + 0.005, OPEN_PRICE], [1, OPEN_PRICE]] as const;

function path(keys: readonly (readonly [number, number])[], t: number, y: (v: number) => number, from = 0, xf = x) {
  const n = 160;
  const pts: string[] = [];
  for (let i = 0; i <= n; i++) {
    const u = from + ((t - from) * i) / n;
    if (u > t) break;
    pts.push(`${i ? "L" : "M"}${xf(u).toFixed(1)} ${y(at(keys, u)).toFixed(1)}`);
  }
  return pts.join(" ");
}

/** The two small charts are half as wide and share the same time axis. */
const sx = (t: number) => 20 + t * (W / 2 - 28);

const days: [number, string][] = [[0, "Friday close"], [0.3, "Saturday"], [0.58, "Sunday"], [CROSS, "Monday open"]];

function Axis({ y0 }: { y0: number }) {
  return (
    <>
      {days.map(([t, label]) => (
        <g key={label}>
          <line x1={x(t)} x2={x(t)} y1={y0} y2={y0 + 5} stroke={C.grey} />
          <text x={x(t)} y={y0 + 18} fill={C.grey} fontSize="11" textAnchor={t === 0 ? "start" : "middle"}>{label}</text>
        </g>
      ))}
    </>
  );
}

/** Three charts on one time axis: the price tape, the queue, and LP profit and loss. */
export function WeekendTape({ scenario, t, onPick, picked }: { scenario: WeekendScenario; t: number; onPick: (o: WeekendOrder | null) => void; picked: WeekendOrder | null }) {
  const lo = 190, hi = 222;
  const py = (p: number) => 20 + (1 - (p - lo) / (hi - lo)) * 250;
  const q = queueAt(scenario.orders, t);
  const maxQ = Math.max(1, ...scenario.orders.map((o) => o.usd).reduce<number[]>((a, v) => [...a, (a.at(-1) ?? 0) + v], []));
  const qy = (v: number) => 100 - (v / maxQ) * 84;
  const qKeys: [number, number][] = [[0, 0]];
  scenario.orders.forEach((o, i) => {
    const before = scenario.orders.slice(0, i).reduce((s, v) => s + v.usd, 0);
    qKeys.push([o.at, before], [o.at + 0.001, before + o.usd]);
  });
  const total = scenario.orders.reduce((s, o) => s + o.usd, 0);
  qKeys.push([CROSS - 0.001, total], [CROSS, 0], [1, 0]);
  const pnlMin = Math.min(scenario.pnl.noHook, scenario.pnl.feeOnly, scenario.pnl.corvex, -20) * 1.1;
  const pnlMax = Math.max(scenario.pnl.noHook, scenario.pnl.feeOnly, scenario.pnl.corvex, 20) * 1.1;
  const ly = (v: number) => 12 + (1 - (v - pnlMin) / (pnlMax - pnlMin)) * 100;

  return (
    <div className="space-y-2 text-snow">
      <svg viewBox={`0 0 ${W} 300`} className="h-auto w-full" role="img" aria-label="Pool price over the weekend: no-hook pool, Corvex pool, Chainlink price and queued orders">
        <rect x={x(0)} y={py(CLOSE_PRICE * (1 + BAND))} width={x(CROSS) - x(0)} height={py(CLOSE_PRICE * (1 - BAND)) - py(CLOSE_PRICE * (1 + BAND))} fill="#2650ff" opacity="0.16" />
        {[CLOSE_PRICE * (1 + BAND), CLOSE_PRICE * (1 - BAND)].map((v, i) => (
          <g key={i}>
            <line x1={x(0)} x2={x(CROSS)} y1={py(v)} y2={py(v)} stroke={C.blue} strokeDasharray="3 4" opacity="0.7" />
            <text x={x(0) - 6} y={py(v) + 4} fill={C.blue} fontSize="11" textAnchor="end">{i ? "-2%" : "+2%"}</text>
          </g>
        ))}
        {[190, 200, 210, 220].map((v) => (
          <g key={v}>
            <line x1={x(0)} x2={x(1)} y1={py(v)} y2={py(v)} stroke={C.grid} />
            {v !== 200 && <text x={x(0) - 6} y={py(v) + 4} fill={C.grey} fontSize="11" textAnchor="end">${v}</text>}
          </g>
        ))}
        <line x1={x(CROSS)} x2={x(CROSS)} y1={20} y2={270} stroke={C.blue} opacity="0.4" />
        <text x={x(CROSS) - 6} y={34} fill={C.blue} fontSize="11" textAnchor="end">the cross</text>

        <path d={path(FAIR, Math.min(t, CROSS - 0.005), py)} stroke={C.grey} strokeWidth="2" strokeDasharray="5 5" fill="none" />
        {t > CROSS - 0.005 && <path d={path(FAIR, t, py, CROSS - 0.005)} stroke={C.blue} strokeWidth="2.5" fill="none" />}
        <path d={path(scenario.noHook, t, py)} stroke={C.rose} strokeWidth="2.5" fill="none" />
        <path d={path(scenario.corvex, t, py)} stroke={C.paper} strokeWidth="3" fill="none" />

        {scenario.orders.map((o) => {
          const p = orderAt(o, t);
          if (!p.shown) return null;
          const colour = p.slide > 0.4 ? (o.kind === "filled" ? C.mint : C.amber) : o.side === "buy" ? C.blue : C.paper;
          const sel = picked?.id === o.id;
          return (
            <g
              key={o.id}
              role="button"
              tabIndex={0}
              aria-label={`${o.side} order, limit $${o.limit}`}
              onClick={() => onPick(sel ? null : o)}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onPick(sel ? null : o))}
              style={{ cursor: "pointer", opacity: o.kind === "refunded" ? 1 - Math.min(1, Math.max(0, (p.slide - 0.5) * 2)) * 0.85 : 1 }}
            >
              <circle cx={x(p.time)} cy={py(p.price)} r={sel ? 10 : 6 + o.usd / 1500} fill={colour} stroke={sel ? "#fff" : "none"} strokeWidth="2" />
              <circle cx={x(p.time)} cy={py(p.price)} r={16} fill="transparent" />
            </g>
          );
        })}
        {t > CROSS + 0.02 && scenario.orders.length > 0 && <text x={x(0.9)} y={py(P_STAR) - 24} fill={C.mint} textAnchor="middle" fontSize="11">p* ${P_STAR.toFixed(2)}</text>}
        <Axis y0={278} />
        <line x1={x(t)} x2={x(t)} y1={20} y2={270} stroke={C.paper} opacity="0.35" />
      </svg>

      <div className="grid gap-2 md:grid-cols-2">
        <svg viewBox={`0 0 ${W / 2} 130`} className="h-auto w-full" role="img" aria-label="Orders waiting in the queue">
          <text x="4" y="12" fill={C.grey} fontSize="10.5">Queue: {q.count} orders, ${q.usd.toLocaleString("en-US")}</text>
          <line x1={20} x2={W / 2 - 8} y1={100} y2={100} stroke={C.grid} />
          <path d={path(qKeys, t, qy, 0, sx)} stroke={C.blue} strokeWidth="2.5" fill="none" />
        </svg>
        <svg viewBox={`0 0 ${W / 2} 130`} className="h-auto w-full" role="img" aria-label="LP profit and loss">
          <text x="4" y="12" fill={C.grey} fontSize="10.5">LP profit and loss, USDG (the path between measured end points is illustrative)</text>
          <line x1={20} x2={W / 2 - 8} y1={ly(0)} y2={ly(0)} stroke={C.grid} />
          {([["lpNoHook", C.rose], ["lpFeeOnly", C.amber], ["lpCorvex", C.paper]] as const).map(([k, c]) => (
            <path
              key={k}
              d={path(scenario[k], t, ly, 0, sx)}
              stroke={c}
              strokeWidth="2.5"
              fill="none"
            />
          ))}
          {([["lpNoHook", C.rose], ["lpFeeOnly", C.amber], ["lpCorvex", C.paper]] as const).map(([k, c]) => {
            const v = at(scenario[k], t);
            return <text key={k} x={W / 2 - 10} y={Math.max(24, Math.min(124, ly(v) - 6))} fill={c} fontSize="10.5" textAnchor="end">{v.toFixed(2)}</text>;
          })}
        </svg>
      </div>
    </div>
  );
}

/** Scrubber with play and the scenario's order story. Owns the playhead. */
export function usePlayhead() {
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const raf = useRef(0);
  useEffect(() => {
    if (!playing) return;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      let done = false;
      setT((v) => {
        const n = v + dt / 16;
        if (n >= 1) done = true;
        return Math.min(1, n);
      });
      if (done) setPlaying(false);
      else raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [playing]);
  return { t, setT, playing, setPlaying };
}
