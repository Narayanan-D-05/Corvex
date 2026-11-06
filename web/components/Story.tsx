"use client";

import { CrossMachine, caption, PHASE, useCycle } from "./CrossMachine";

const steps = [
  { title: "Market closes", body: "Trades inside the 2% band still fill. Bigger ones wait.", from: 0, when: "Friday close" },
  { title: "Orders queue", body: "Large trades become claims in the queue. Nothing fills at Friday's price.", from: PHASE.queue, when: "Saturday and Sunday" },
  { title: "One cross", body: "Four checks pass. Buys match sells at one reference price, and only the left-over trades against the pool.", from: PHASE.match - 0.02, when: "Monday open" },
  { title: "Surplus and gap auction", body: "The surplus goes to LPs with donate(). What is left of the gap closes through a fee that starts at 5% and falls every block.", from: PHASE.surplus, when: "Minutes after the open" },
];

const stepAt = (p: number) => steps.reduce((acc, s, i) => (p >= s.from ? i : acc), 0);

export function Story() {
  const { u, still } = useCycle(18);
  const active = stepAt(u);
  return (
    <section id="how" className="relative isolate overflow-hidden bg-night text-paper">
      <div className="mx-auto grid max-w-[1100px] items-center gap-10 px-4 py-24 md:grid-cols-[0.85fr_1.35fr]">
        <div>
          <h2 className="font-display text-5xl leading-[1.02] md:text-6xl">How a cross works</h2>
          <ol className="mt-10 space-y-1">
            {steps.map((s, i) => {
              const on = still || i === active;
              return (
                <li key={s.title} className={`relative border-l-2 py-3 pl-6 transition-colors duration-500 ${on ? "border-cobalt" : i < active ? "border-paper/40" : "border-paper/15"}`}>
                  <span className={`absolute -left-[7px] top-[1.15rem] h-3 w-3 rounded-full transition-colors duration-500 ${on ? "bg-cobalt" : i < active ? "bg-paper/50" : "bg-night ring-2 ring-paper/20"}`} />
                  <div className={`transition-opacity duration-500 ${on || i < active ? "opacity-100" : "opacity-45"}`}>
                    <div className="flex items-baseline justify-between gap-4">
                      <h3 className="text-lg font-semibold">{s.title}</h3>
                      <span className="text-xs text-paper/55">{s.when}</span>
                    </div>
                    <div className={`grid transition-all duration-500 ${on ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
                      <p className="max-w-[40ch] overflow-hidden pt-1 text-paper/75">{s.body}</p>
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
        <div className="overflow-hidden rounded-2xl border border-paper/15 bg-night p-5 shadow-[0_30px_80px_-30px_rgba(38,80,255,0.55)]">
          <CrossMachine u={u} buys={10} sells={6} />
          <p className="mt-3 min-h-[3rem] text-paper/80" aria-live="off">{caption(u, 10, 6, false)}</p>
        </div>
      </div>
    </section>
  );
}
