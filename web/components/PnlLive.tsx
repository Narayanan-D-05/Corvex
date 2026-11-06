import { at, type WeekendScenario } from "@/lib/weekend";

const rows = [
  { key: "lpNoHook", end: "noHook", label: "No hook", bar: "bg-[#ff8a73]", text: "text-[#ff8a73]" },
  { key: "lpFeeOnly", end: "feeOnly", label: "Fee-only hook", bar: "bg-[#e5b552]", text: "text-[#e5b552]" },
  { key: "lpCorvex", end: "corvex", label: "Corvex", bar: "bg-lime", text: "text-lime" },
] as const;

const sign = (v: number) => (v > 0.005 ? "+" : "");

/**
 * LP profit and loss for the weekend that is playing, as bars from a zero line. The numbers are the chart's own
 * values at the current moment, so they move with the graph and land on the measured results at the end.
 */
export function PnlLive({ scenario, t }: { scenario: WeekendScenario; t: number }) {
  const max = Math.max(...rows.map((r) => Math.abs(scenario.pnl[r.end])), 1);
  return (
    <div className="space-y-5" role="group" aria-label="LP profit and loss, live">
      {rows.map((r) => {
        const v = at(scenario[r.key], t);
        const w = (Math.abs(v) / max) * 50;
        return (
          <div key={r.key} className="grid grid-cols-[7.5rem_1fr_5.5rem] items-center gap-3">
            <span className={`text-sm ${r.key === "lpCorvex" ? "font-semibold text-snow" : "text-slate"}`}>{r.label}</span>
            <div className="relative h-3 rounded-full bg-white/[0.06]" aria-hidden="true">
              <i className="absolute inset-y-[-4px] left-1/2 w-px bg-white/25" />
              <div className={`absolute inset-y-0 rounded-full ${r.bar}`} style={v >= 0 ? { left: "50%", width: `${w}%` } : { right: "50%", width: `${w}%` }} />
            </div>
            <span className={`num text-right text-lg ${r.text}`}>
              {sign(v)}
              {v.toFixed(2)}
            </span>
          </div>
        );
      })}
      <p className="text-sm text-slate">LP PnL in USDG on a 400,000 USDG pool, marked at the reopen price. The numbers follow the graph.</p>
    </div>
  );
}
