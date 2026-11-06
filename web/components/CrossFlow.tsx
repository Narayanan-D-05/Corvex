/** The cross as four stages joined by pulses. The stage that is active lights up. */
const stages = [
  { name: "Queue", line: "10 buys and 6 sells wait", sub: "Nothing fills at Friday's price" },
  { name: "Match", line: "6 buys meet 6 sells", sub: "At p*, with no pool and no fee" },
  { name: "Uniswap v4 pool", line: "The 4 left over swap", sub: "With a price limit of p*" },
  { name: "LPs", line: "The surplus is donated", sub: "A falling fee closes the gap" },
];

export function CrossFlow({ active }: { active: number }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-[#0e1f19] p-5 md:p-7" role="img" aria-label="The cross in four stages: queue, match, pool, LPs">
      <ol className="grid gap-0 md:grid-cols-4">
        {stages.map((s, i) => {
          const on = i === active;
          const done = i < active;
          return (
            <li key={s.name} className="relative flex flex-col md:pr-6">
              <div className="flex items-center gap-3">
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-sm transition-colors duration-500 num ${on ? "border-lime bg-lime text-night" : done ? "border-lime/50 text-lime" : "border-white/20 text-snow/50"}`}>{i + 1}</span>
                <span className="relative hidden h-px flex-1 bg-white/15 md:block">
                  {i < stages.length - 1 && on && <i className="pulse-dot absolute -top-[3px] h-[7px] w-[7px] rounded-full bg-lime" />}
                </span>
              </div>
              <div className={`mt-4 transition-opacity duration-500 ${on ? "opacity-100" : done ? "opacity-70" : "opacity-40"}`}>
                <h3 className="tag text-snow/60">{s.name}</h3>
                <p className="mt-2 text-lg font-medium leading-snug">{s.line}</p>
                <p className="mt-1 text-sm text-snow/60">{s.sub}</p>
              </div>
              {i < stages.length - 1 && <span className="my-4 ml-[1.1rem] h-6 w-px bg-white/15 md:hidden" aria-hidden="true" />}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
