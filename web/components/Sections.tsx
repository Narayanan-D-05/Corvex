import Link from "next/link";
import { ClayLazy } from "./ClayLazy";
import { Magnetic } from "./Motion";

import { LogoMark } from "./Logo";

export function Cta() {
  return (
    <section className="relative isolate overflow-hidden bg-night text-snow">
      <div aria-hidden="true" className="columns pointer-events-none absolute inset-y-0 left-1/2 -z-10 w-[min(1200px,100%)] -translate-x-1/2" />
      <div aria-hidden="true" className="pointer-events-none absolute left-1/2 top-1/2 -z-10 h-[420px] w-[720px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-lime/10 blur-[120px]" />
      <div className="pointer-events-none absolute inset-0 -z-10 hidden md:block" aria-hidden="true">
        <ClayLazy preset="ring" />
      </div>
      <div className="mx-auto flex max-w-[1200px] flex-col items-center px-6 py-32 text-center">
        <p className="tag rounded-md border border-white/20 px-3 py-1.5 text-lime">Open source</p>
        <h2 className="mt-8 max-w-[16ch] font-display text-5xl leading-[1.02] md:text-7xl">Every open gets a price other chains can settle on.</h2>
        <p className="mt-6 max-w-[52ch] text-lg text-snow/70">
          Each cross records a Session Print. Chainlink CRE checks it against the official open, and CCIP carries it to Arbitrum and Base.
        </p>
        <div className="mt-10">
          <Magnetic strength={0.4}>
            <Link href="/app" className="tag lift block rounded-md bg-lime px-8 py-4 text-night hover:bg-[#d8ff86]">
              Launch app
            </Link>
          </Magnetic>
        </div>
      </div>
    </section>
  );
}

const cols = [
  { h: "Product", items: [["Launch app", "/app"], ["Replay", "/replay"], ["Docs", "/docs"]] },
  { h: "Code", items: [["GitHub", "https://github.com/Narayanan-D-05/Corvex"], ["Hook contract", "https://github.com/Narayanan-D-05/Corvex/blob/main/contracts/src/ReopenCrossHook.sol"], ["CRE workflow", "https://github.com/Narayanan-D-05/Corvex/tree/main/cre/session-attestor"]] },
];

export function Footer() {
  return (
    <footer className="relative overflow-hidden bg-night text-snow">
      <div className="mx-auto grid max-w-[1200px] gap-10 px-6 pt-16 md:grid-cols-[1.4fr_1fr_1fr]">
        <span className="inline-flex items-start gap-2.5 text-lg font-semibold text-lime">
          <LogoMark />
          Corvex
        </span>
        {cols.map((c) => (
          <nav key={c.h} aria-label={c.h}>
            <p className="tag text-snow/50">[ {c.h} ]</p>
            <ul className="mt-4 space-y-2 text-sm">
              {c.items.map(([label, href]) => (
                <li key={label}>
                  {href.startsWith("/") ? (
                    <Link href={href} className="uppercase tracking-wide text-snow/80 hover:text-lime">{label}</Link>
                  ) : (
                    <a href={href} target="_blank" rel="noreferrer" className="uppercase tracking-wide text-snow/80 hover:text-lime">{label}</a>
                  )}
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div aria-hidden="true" className="select-none whitespace-nowrap px-4 pt-12 text-center font-display text-[clamp(7rem,27vw,26rem)] leading-[0.78] text-snow/[0.07]">
        Corvex
      </div>
    </footer>
  );
}
