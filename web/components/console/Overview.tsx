"use client";

import { useEffect, useRef, useState } from "react";
import { MODES, fmtPrice } from "@/lib/chain";
import type { State } from "@/lib/useCorvex";

const modeTone = ["bg-lime/15 text-lime", "bg-white/10 text-snow", "bg-amber/15 text-amber", "bg-[#6fa8ff]/15 text-[#9cc2ff]"];

function line(s: NonNullable<State["snap"]>): string {
  switch (s.mode) {
    case 0:
      return "Market open. Trades fill at the normal fee.";
    case 1:
      if (!s.marketOpen) return "Market closed. Big trades wait for the open.";
      if (s.oraclePaused) return "Token oracle paused. Big trades wait.";
      if (!s.feedFresh) return "Price feed is stale. Big trades wait.";
      return "Scheduled pause. Big trades wait for the reopen.";
    case 2:
      return "Reference is back. Trading pauses until the cross runs.";
    default:
      return "Cross done. A falling fee closes the leftover gap.";
  }
}

function Countdown({ to }: { to: number }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Math.floor(Date.now() / 1000));
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(t);
  }, []);
  if (!to || now === null) return null;
  const left = to - now;
  if (left <= 0) return <span>Scheduled reopen passed</span>;
  const h = Math.floor(left / 3600), m = Math.floor((left % 3600) / 60), s = left % 60;
  return <span>Cross in <span className="num">{h}h {m}m {s}s</span></span>;
}

const lights = [
  { key: "session", label: "Session", tip: "The exchange is in its regular session and no scheduled pause is active." },
  { key: "unpaused", label: "Unpaused", tip: "The stock token's oracle is not paused (for example during a split)." },
  { key: "fresh", label: "Fresh feed", tip: "The price feed updated within the allowed window." },
  { key: "multiplier", label: "Multiplier", tip: "The token's multiplier matches the one announced for a split." },
  { key: "plausible", label: "Plausible", tip: "The new price is within 20% of the price before the pause." },
] as const;

/** The pool's state at a glance: a status tile and the four prices. Renders into the page's bento grid. */
export function Overview({ c }: { c: State }) {
  const s = c.snap!;
  const ok: Record<(typeof lights)[number]["key"], boolean> = {
    session: s.marketOpen && s.scheduleClear,
    unpaused: !s.oraclePaused,
    fresh: s.feedFresh,
    multiplier: s.multiplierOk,
    plausible: s.plausible,
  };
  const gap = s.refPrice > 0n ? ((Number(s.poolPrice) - Number(s.refPrice)) / Number(s.refPrice)) * 100 : 0;
  const passing = Object.values(ok).filter(Boolean).length;

  return (
    <>
      <section aria-live="polite" className="tile lg:col-span-4">
        <div className="flex items-center gap-3">
          <span data-testid="mode" className={`tag rounded-md px-3 py-1.5 ${modeTone[s.mode]}`}>{MODES[s.mode]}</span>
          <span className="tag text-snow/50">Session <span className="num">{s.sessionId.toString()}</span></span>
          {s.mode === 1 && <span className="relative ml-auto flex h-2.5 w-2.5"><i className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white/40" /><i className="relative inline-flex h-2.5 w-2.5 rounded-full bg-white/70" /></span>}
        </div>
        <p className="mt-3 font-display text-2xl leading-tight">{line(s)}</p>
        {s.reopenAt > 0 && <p className="mt-2 text-sm text-slate"><Countdown to={s.reopenAt} /></p>}
        {s.expired && <p className="mt-2 text-sm text-rose">The reopen timed out. Anyone can refund the queue.</p>}
        <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-4" aria-label={`Reopen checks, ${passing} of 5 passing`}>
          {lights.map((l) => (
            <span key={l.key} title={`${l.label}: ${l.tip}`} className={`tag flex items-center gap-1 rounded-md border px-1.5 py-1 text-[0.65rem] ${ok[l.key] ? "border-white/10 text-snow/70" : "border-rose/50 text-rose"}`}>
              <i aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${ok[l.key] ? "bg-lime" : "bg-rose"}`} />
              {l.label}
              <span className="sr-only">{ok[l.key] ? "passing" : "failing"}</span>
            </span>
          ))}
        </div>
      </section>

      <div className="grid grid-cols-2 gap-4 lg:col-span-8 lg:grid-cols-4">
        <Price label="Pool price" value={`$${fmtPrice(s.poolPrice)}`} hint="Where the pool trades now" />
        <Price label="Reference price" value={s.refPrice > 0n ? `$${fmtPrice(s.refPrice)}` : "none"} hint="The price feed" />
        <Price label="Gap" value={`${gap >= 0 ? "+" : ""}${gap.toFixed(2)}%`} hint="Pool against reference" tone={Math.abs(gap) > 2 ? "text-amber" : undefined} />
        <Price
          label={s.mode === 3 ? "Cross price" : "Last cross price"}
          value={s.mode === 3 ? `$${fmtPrice(s.crossPrice)}` : c.crosses[0] ? `$${fmtPrice(c.crosses[0].price)}` : "none yet"}
          hint="One price for the queue"
          tone="text-lime"
        />
      </div>
    </>
  );
}

/** A price tile that flashes when its value changes. */
function Price({ label, value, hint, tone }: { label: string; value: string; hint: string; tone?: string }) {
  const prev = useRef(value);
  const [flash, setFlash] = useState(false);
  useEffect(() => {
    if (prev.current === value) return;
    prev.current = value;
    setFlash(true);
    const t = setTimeout(() => setFlash(false), 900);
    return () => clearTimeout(t);
  }, [value]);
  return (
    <div className={`tile justify-between transition-colors duration-700 ${flash ? "border-lime/60 bg-lime/10" : ""}`}>
      <div className="tag text-snow/50">{label}</div>
      <div className={`num mt-2 text-3xl ${tone ?? ""}`}>{value}</div>
      <div className="mt-1 text-xs text-slate">{hint}</div>
    </div>
  );
}
