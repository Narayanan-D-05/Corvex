"use client";

import { useEffect, useState } from "react";
import { MODES, fmtPrice } from "@/lib/chain";
import type { State } from "@/lib/useCorvex";

const modeTone = ["bg-mint/15 text-mint", "bg-slate/20 text-ink", "bg-amber/15 text-amber", "bg-cobalt/15 text-cobalt"];

function line(s: NonNullable<State["snap"]>): string {
  switch (s.mode) {
    case 0:
      return "Market open: trades fill at the normal fee.";
    case 1:
      if (!s.marketOpen) return "Market closed: big trades wait for the open.";
      if (s.oraclePaused) return "Token oracle paused: big trades wait until it resumes.";
      if (!s.feedFresh) return "Price feed is stale: big trades wait for a fresh price.";
      return "Scheduled pause: big trades wait for the announced reopen.";
    case 2:
      return "Reference is back. Trading is paused until the cross runs.";
    default:
      return "Cross done. The leftover gap closes through a falling fee.";
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
  const when = new Date(to * 1000).toUTCString().slice(5, 22) + " UTC";
  if (left <= 0) return <span className="num">Scheduled reopen passed ({when})</span>;
  const h = Math.floor(left / 3600), m = Math.floor((left % 3600) / 60), s = left % 60;
  return (
    <span>
      Cross scheduled <span className="num">{when}</span>, in <span className="num">{h}h {m}m {s}s</span>
    </span>
  );
}

const lights = [
  { key: "session", label: "Session", tip: "The exchange is in its regular session and no scheduled pause is active." },
  { key: "unpaused", label: "Unpaused", tip: "The stock token's oracle is not paused (for example during a split)." },
  { key: "fresh", label: "Fresh feed", tip: "The price feed updated within the allowed window." },
  { key: "multiplier", label: "Multiplier", tip: "The token's multiplier matches the one announced for a split." },
  { key: "plausible", label: "Plausible", tip: "The new price is within 20% of the price before the pause." },
] as const;

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

  return (
    <div className="space-y-8">
      <section aria-live="polite" className="rounded-2xl border border-line bg-paper-2 p-6 md:p-8">
        <div className="flex flex-wrap items-center gap-3">
          <span data-testid="mode" className={`rounded-md px-3 py-1 text-sm font-semibold ${modeTone[s.mode]}`}>{MODES[s.mode]}</span>
          <span className="text-sm text-slate">Session <span className="num">{s.sessionId.toString()}</span></span>
        </div>
        <p className="mt-4 font-display text-3xl leading-tight md:text-4xl">{line(s)}</p>
        {s.reopenAt > 0 && <p className="mt-3 text-slate"><Countdown to={s.reopenAt} /></p>}
        {s.expired && <p className="mt-3 text-rose">The reopen timed out. Queued orders can be refunded by anyone.</p>}
      </section>

      <section>
        <h2 className="text-lg font-semibold">Reopen checks</h2>
        <ul className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-5">
          {lights.map((l) => (
            <li key={l.key} title={l.tip} className="flex items-center gap-3 rounded-xl border border-line px-4 py-3">
              <span aria-hidden="true" className={`h-3 w-3 shrink-0 rounded-full ${ok[l.key] ? "bg-mint" : "bg-rose"}`} />
              <span className="text-sm">{l.label}</span>
              <span className="sr-only">{ok[l.key] ? "passing" : "failing"}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-sm text-slate">A cross runs only when all five pass.</p>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <Figure label="Pool price" value={`$${fmtPrice(s.poolPrice)}`} />
        <Figure label="Reference price" value={s.refPrice > 0n ? `$${fmtPrice(s.refPrice)}` : "none"} />
        <Figure label="Gap" value={`${gap >= 0 ? "+" : ""}${gap.toFixed(2)}%`} />
        {s.mode === 3 && <Figure label="Cross price" value={`$${fmtPrice(s.crossPrice)}`} />}
        {s.multiplier !== 10n ** 18n && <Figure label="Multiplier" value={`${(Number(s.multiplier) / 1e18).toFixed(2)}x`} />}
      </section>
    </div>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line px-5 py-4">
      <div className="text-sm text-slate">{label}</div>
      <div className="num mt-1 text-2xl">{value}</div>
    </div>
  );
}
