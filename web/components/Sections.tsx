import Image from "next/image";
import Link from "next/link";
import { LossBars } from "./LossBars";
import { scenarios } from "@/lib/replay";
import { LogoMark } from "./Logo";

export function Proof() {
  return (
    <section className="dark-ui relative isolate overflow-hidden">
      <div aria-hidden="true" className="columns pointer-events-none absolute inset-y-0 left-1/2 -z-10 w-[min(1200px,100%)] -translate-x-1/2" />
      <div className="mx-auto grid max-w-[1200px] gap-14 px-6 py-28 md:grid-cols-[1fr_1.1fr]">
        <div>
          <p className="tag text-lime">[ The result ]</p>
          <h2 className="mt-5 font-display text-5xl leading-[1.02] md:text-6xl">LPs keep the gap.</h2>
          <p className="mt-6 max-w-[40ch] text-lg text-slate">
            The same weekend through three pools. The queue clears at the reopen price, so the first bot has nothing left to take.
          </p>
          <Link href="/replay" className="tag lift mt-8 inline-block rounded-md border border-white/20 px-6 py-3.5 hover:border-white/50">
            Open the replay
          </Link>
        </div>
        <div className="rounded-2xl border border-line bg-paper-2 p-7">
          <h3 className="mb-6 text-base font-semibold">{scenarios[0].title}</h3>
          <LossBars scenario={scenarios[0]} />
        </div>
      </div>
    </section>
  );
}

const brands = [
  { name: "Uniswap v4", src: "/brands/uniswap.png", use: "Hook, pools" },
  { name: "Chainlink", src: "/brands/chainlink.svg", use: "CCIP, CRE, Data Feeds" },
  { name: "Robinhood Chain", src: "/brands/robinhood.svg", use: "Hook and cross" },
  { name: "Arbitrum Sepolia", src: "/brands/arbitrum.png", use: "Oracle, schedule" },
  { name: "Base Sepolia", src: "/brands/base.png", use: "Oracle, orders" },
];

export function BuiltOn() {
  return (
    <section className="dark-ui border-y border-line">
      <div className="mx-auto max-w-[1200px] px-6 py-14">
        <p className="tag text-lime">[ Built on ]</p>
        <ul className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-5">
          {brands.map((b) => (
            <li key={b.name} className="lift flex items-center gap-3 rounded-xl border border-line bg-paper-2 px-4 py-3 hover:border-white/30">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white">
                <Image src={b.src} alt="" width={22} height={22} className="h-[22px] w-[22px] object-contain" />
              </span>
              <span className="min-w-0 text-sm">
                <span className="block truncate font-medium">{b.name}</span>
                <span className="block truncate text-slate">{b.use}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export function Cta() {
  return (
    <section className="relative isolate overflow-hidden bg-night text-snow">
      <div aria-hidden="true" className="columns pointer-events-none absolute inset-y-0 left-1/2 -z-10 w-[min(1200px,100%)] -translate-x-1/2" />
      <div aria-hidden="true" className="pointer-events-none absolute left-1/2 top-1/2 -z-10 h-[420px] w-[720px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-lime/10 blur-[120px]" />
      <div className="mx-auto flex max-w-[1200px] flex-col items-center px-6 py-32 text-center">
        <p className="tag rounded-md border border-white/20 px-3 py-1.5 text-lime">Open source</p>
        <h2 className="mt-8 max-w-[16ch] font-display text-5xl leading-[1.02] md:text-7xl">Every open gets a price other chains can settle on.</h2>
        <p className="mt-6 max-w-[52ch] text-lg text-snow/70">
          Each cross records a Session Print. Chainlink CRE checks it against the official open, and CCIP carries it to Arbitrum and Base.
        </p>
        <Link href="/app" className="tag lift mt-10 rounded-md bg-lime px-8 py-4 text-night hover:bg-[#d8ff86]">
          Launch app
        </Link>
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
