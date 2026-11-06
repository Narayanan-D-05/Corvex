import Link from "next/link";
import { CrossConsole } from "./CrossConsole";
import { Tilt } from "./Tilt";

export function Hero() {
  return (
    <section className="relative isolate flex min-h-[100svh] items-center overflow-hidden bg-night text-snow">
      <div aria-hidden="true" className="columns pointer-events-none absolute inset-y-0 left-1/2 -z-10 w-[min(1200px,100%)] -translate-x-1/2" />
      <div aria-hidden="true" className="pointer-events-none absolute -right-40 top-10 -z-10 h-[620px] w-[620px] rounded-full bg-lime/10 blur-[140px]" />
      <div className="mx-auto grid w-full max-w-[1200px] items-center gap-12 px-6 pb-16 pt-32 lg:grid-cols-[1.05fr_1fr]">
        <div>
          <p className="tag text-lime">[ Uniswap v4 hook for stock tokens ]</p>
          <h1 className="mt-6 font-display text-[clamp(2.8rem,5.4vw,5rem)] leading-[1]">
            One fair price for <span className="text-lime">every open.</span>
          </h1>
          <p className="mt-7 max-w-[44ch] text-lg text-snow/75">
            While a stock&apos;s price is dark, large orders wait in a queue. When it returns, the whole queue clears at one fair price and the surplus goes to LPs.
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-4">
            <Link href="/app" className="tag lift rounded-md bg-lime px-6 py-3.5 text-night hover:bg-[#d8ff86]">
              Launch app
            </Link>
            <Link href="/#how" className="tag lift rounded-md border border-white/20 px-6 py-3.5 text-snow hover:border-white/50">
              See how a cross works
            </Link>
          </div>
        </div>
        <Tilt>
          <CrossConsole />
        </Tilt>
      </div>
    </section>
  );
}
