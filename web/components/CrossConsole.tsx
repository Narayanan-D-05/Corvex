"use client";

import { useState } from "react";
import { useCycle } from "@/lib/useCycle";

/** One demo weekend, written out: the same numbers the console shows. p* is $212.00. */
const P_STAR = 212;
const rows = [
  { side: "Buy", size: "3,000 USDG", limit: "$215.00", fills: true },
  { side: "Sell", size: "15 TSLA", limit: "$205.00", fills: true },
  { side: "Buy", size: "1,200 USDG", limit: "$214.00", fills: true },
  { side: "Sell", size: "4.2 TSLA", limit: "$208.00", fills: true },
  { side: "Buy", size: "800 USDG", limit: "$209.00", fills: false },
  { side: "Buy", size: "2,500 USDG", limit: "$216.00", fills: true },
];
const MATCHED = 4070;
const TO_POOL = 2630;

type Phase = { mode: string; tone: string };
const phase = (u: number): Phase =>
  u < 0.08 ? { mode: "Normal", tone: "bg-lime/15 text-lime" }
  : u < 0.5 ? { mode: "Dark", tone: "bg-white/10 text-snow" }
  : u < 0.6 ? { mode: "Awaiting reopen", tone: "bg-[#e5b552]/15 text-[#e5b552]" }
  : u < 0.72 ? { mode: "Cross", tone: "bg-lime text-night" }
  : { mode: "Auction", tone: "bg-[#6fa8ff]/15 text-[#9cc2ff]" };

/** The product itself, live: orders wait while the market is closed, then clear at one price. Loops on its own. */
export function CrossConsole() {
  const [paused, setPaused] = useState(false);
  const { u, still } = useCycle(20, paused);
  const ph = phase(u);
  const closed = u >= 0.08;
  const reopened = u >= 0.5;
  const crossed = u >= 0.6;
  const settled = u >= 0.72;

  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#0e1f19] text-snow shadow-[0_40px_120px_-40px_rgba(201,255,92,0.25)]" role="img" aria-label="Corvex console: orders queue while the market is closed, then clear at one price at the open">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="flex gap-1.5" aria-hidden="true">
            <i className="h-2.5 w-2.5 rounded-full bg-white/20" />
            <i className="h-2.5 w-2.5 rounded-full bg-white/20" />
            <i className="h-2.5 w-2.5 rounded-full bg-white/20" />
          </span>
          <span className="tag text-snow/60">TSLA / USDG pool</span>
        </div>
        <div className="flex items-center gap-3">
          <span className={`tag rounded-md px-2.5 py-1 transition-colors duration-500 ${ph.tone}`}>{ph.mode}</span>
          {!still && (
            <button type="button" onClick={() => setPaused((p) => !p)} className="tag rounded-md border border-white/15 px-2 py-1 text-snow/70 hover:text-snow" aria-label={paused ? "Play the demo" : "Pause the demo"}>
              {paused ? "Play" : "Pause"}
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-px bg-white/10 md:grid-cols-4">
        <Tile label="Pool price" value={crossed ? `$${(P_STAR + 0.04).toFixed(2)}` : "$200.00"} />
        <Tile label="Reference" value={reopened ? `$${P_STAR.toFixed(2)}` : "dark"} dim={!reopened} />
        <Tile label="Gap" value={reopened ? "+6.00%" : "none"} dim={!reopened} />
        <Tile label="Cross p*" value={crossed ? `$${P_STAR.toFixed(2)}` : "waiting"} dim={!crossed} accent={crossed} />
      </div>

      <div className="px-4 pb-4 pt-3">
        <table className="w-full text-left text-sm">
          <thead className="tag text-snow/50">
            <tr>
              <th className="py-2 font-normal">Side</th>
              <th className="font-normal">Size</th>
              <th className="font-normal">Limit</th>
              <th className="text-right font-normal">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const shown = closed && u >= 0.12 + i * 0.05;
              const status = !crossed ? "In queue" : !settled ? "Matching" : r.fills ? "Settled" : "Refunded";
              const chip = !crossed ? "bg-[#e5b552]/15 text-[#e5b552]" : !settled ? "bg-[#6fa8ff]/15 text-[#9cc2ff]" : r.fills ? "bg-lime/15 text-lime" : "bg-white/10 text-snow/70";
              return (
                <tr key={i} className={`border-t border-white/10 transition-all duration-500 ${shown ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"}`}>
                  <td className={`py-2.5 ${r.side === "Buy" ? "text-[#9cc2ff]" : "text-snow"}`}>{r.side}</td>
                  <td className="num">{r.size}</td>
                  <td className="num text-snow/70">{r.limit}</td>
                  <td className="text-right">
                    <span className={`tag inline-block rounded-md px-2 py-1 transition-colors duration-500 ${chip}`}>{status}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <div className={`mt-4 transition-opacity duration-700 ${crossed ? "opacity-100" : "opacity-30"}`}>
          <div className="flex h-2.5 overflow-hidden rounded-full bg-white/10">
            <div className="h-full bg-lime transition-all duration-1000" style={{ width: crossed ? `${(MATCHED / (MATCHED + TO_POOL)) * 100}%` : "0%" }} />
            <div className="h-full bg-[#6fa8ff] transition-all duration-1000" style={{ width: crossed ? `${(TO_POOL / (MATCHED + TO_POOL)) * 100}%` : "0%" }} />
          </div>
          <div className="mt-2 flex flex-wrap justify-between gap-x-4 gap-y-1 text-xs text-snow/70">
            <span><i className="mr-1.5 inline-block h-2 w-2 rounded-full bg-lime" />Matched with each other <span className="num text-snow">$4,070</span></span>
            <span><i className="mr-1.5 inline-block h-2 w-2 rounded-full bg-[#6fa8ff]" />Swapped against the pool <span className="num text-snow">$2,630</span></span>
            <span className={`transition-opacity duration-700 ${settled ? "opacity-100" : "opacity-0"}`}>Surplus to LPs <span className="num text-lime">1.29 TSLA</span></span>
          </div>
        </div>
      </div>
    </div>
  );
}

function Tile({ label, value, dim, accent }: { label: string; value: string; dim?: boolean; accent?: boolean }) {
  return (
    <div className="bg-[#0e1f19] px-4 py-3">
      <div className="tag text-snow/50">{label}</div>
      <div className={`num mt-1 text-lg transition-colors duration-500 ${accent ? "text-lime" : dim ? "text-snow/40" : "text-snow"}`}>{value}</div>
    </div>
  );
}
