"use client";

import { useCycle } from "@/lib/useCycle";
import { CrossFlow } from "./CrossFlow";

const steps = [
  { title: "Market closes", body: "Trades inside the 2% band still fill. Bigger ones wait.", from: 0, when: "Friday close", node: 0 },
  { title: "Orders queue", body: "Large trades become claims in the queue. Nothing fills at Friday's price.", from: 0.1, when: "Saturday and Sunday", node: 0 },
  { title: "One cross", body: "Four checks pass. Buys match sells at one reference price, and only the left-over trades against the pool.", from: 0.5, when: "Monday open", node: 1 },
  { title: "Surplus and gap auction", body: "The surplus goes to LPs with donate(). What is left of the gap closes through a fee that starts at 5% and falls every block.", from: 0.78, when: "Minutes after the open", node: 3 },
];

const stepAt = (p: number) => steps.reduce((acc, s, i) => (p >= s.from ? i : acc), 0);

export function Story() {
  const { u, still } = useCycle(20);
  const active = still ? 3 : stepAt(u);
  const node = active === 2 && u > 0.64 ? 2 : steps[active].node;
  return (
    <section id="how" className="relative isolate overflow-hidden bg-night text-snow">
      <div aria-hidden="true" className="columns pointer-events-none absolute inset-y-0 left-1/2 -z-10 w-[min(1200px,100%)] -translate-x-1/2" />
      <div className="mx-auto grid max-w-[1200px] gap-14 px-6 py-28 lg:grid-cols-[0.9fr_1.1fr]">
        <div>
          <p className="tag text-lime">[ How it works ]</p>
          <h2 className="mt-5 font-display text-5xl leading-[1.02] md:text-6xl">How a cross <span className="text-lime">works</span></h2>
          <p className="mt-6 max-w-[40ch] text-snow/70">Four steps, from the close on Friday to the first trade after the open.</p>
        </div>
        <ol className="space-y-1">
          {steps.map((s, i) => {
            const on = still || i === active;
            return (
              <li key={s.title} className={`relative border-l-2 py-3 pl-6 transition-colors duration-500 ${on ? "border-lime" : i < active ? "border-white/40" : "border-white/15"}`}>
                <span className={`absolute -left-[7px] top-[1.15rem] h-3 w-3 rounded-full transition-colors duration-500 ${on ? "bg-lime" : i < active ? "bg-white/50" : "bg-night ring-2 ring-white/20"}`} />
                <div className={`transition-opacity duration-500 ${on || i < active ? "opacity-100" : "opacity-45"}`}>
                  <div className="flex items-baseline justify-between gap-4">
                    <h3 className="text-lg font-semibold">{s.title}</h3>
                    <span className="tag text-snow/50">{s.when}</span>
                  </div>
                  <div className={`grid transition-all duration-500 ${on ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
                    <p className="max-w-[46ch] overflow-hidden pt-1 text-snow/70">{s.body}</p>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      </div>
      <div className="mx-auto max-w-[1200px] px-6 pb-28">
        <CrossFlow active={node} />
      </div>
    </section>
  );
}
