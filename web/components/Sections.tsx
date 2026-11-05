import Image from "next/image";
import Link from "next/link";
import { LossBars } from "./LossBars";
import { scenarios } from "@/lib/replay";
import { LogoMark } from "./Logo";

export function Proof() {
  return (
    <section className="mx-auto grid max-w-[1100px] gap-14 px-4 py-28 md:grid-cols-[1fr_1.1fr]">
      <div>
        <h2 className="font-display text-5xl leading-[1.02] md:text-6xl">LPs keep the gap.</h2>
        <p className="mt-6 max-w-[40ch] text-lg text-slate">
          The same weekend through three pools. The queue clears at the reopen price, so the first bot has nothing left to take.
        </p>
        <Link href="/replay" className="mt-8 inline-block rounded-lg border border-ink px-5 py-2.5 font-medium transition-colors hover:bg-ink hover:text-paper">
          Open the replay
        </Link>
      </div>
      <div className="rounded-2xl border border-line bg-paper-2 p-7">
        <h3 className="mb-6 text-base font-semibold">{scenarios[0].title}</h3>
        <LossBars scenario={scenarios[0]} />
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
    <section className="border-y border-line bg-paper-2/60">
      <div className="mx-auto max-w-[1100px] px-4 py-14">
        <h2 className="text-lg font-semibold">Built on</h2>
        <ul className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-5">
          {brands.map((b) => (
            <li key={b.name} className="flex items-center gap-3 rounded-xl bg-paper px-4 py-3">
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
    <section className="mx-auto max-w-[1100px] px-4 py-28">
      <h2 className="max-w-[16ch] font-display text-5xl leading-[1.02] md:text-7xl">Every open gets a price other chains can settle on.</h2>
      <p className="mt-6 max-w-[52ch] text-lg text-slate">
        Each cross records a Session Print. Chainlink CRE checks it against the official open, and CCIP carries it to Arbitrum and Base.
      </p>
      <Link href="/app" className="mt-9 inline-block rounded-lg bg-cobalt px-6 py-3 font-medium text-white transition-transform hover:-translate-y-0.5">
        Launch app
      </Link>
    </section>
  );
}

export function Footer() {
  return (
    <footer className="relative overflow-hidden bg-night text-paper">
      <div className="mx-auto flex max-w-[1100px] flex-wrap items-center justify-between gap-4 px-4 pt-14">
        <span className="inline-flex items-center gap-2.5 text-lg font-semibold">
          <LogoMark />
          Corvex
        </span>
        <nav className="flex gap-6 text-sm text-paper/70" aria-label="Footer">
          <a href="https://github.com/Narayanan-D-05/Corvex" target="_blank" rel="noreferrer" className="hover:text-paper">
            GitHub
          </a>
          <Link href="/docs" className="hover:text-paper">
            Docs
          </Link>
          <Link href="/replay" className="hover:text-paper">
            Replay
          </Link>
        </nav>
      </div>
      <div aria-hidden="true" className="select-none whitespace-nowrap px-4 pb-0 pt-10 text-center font-display text-[clamp(7rem,26vw,24rem)] leading-[0.8] text-paper/[0.07]">
        Corvex
      </div>
    </footer>
  );
}
