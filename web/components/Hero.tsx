"use client";

import Link from "next/link";
import { CrossMachine, caption, useCycle } from "./CrossMachine";

export function Hero() {
  const { u } = useCycle(16);
  return (
    <section className="relative isolate flex min-h-[100svh] items-end overflow-hidden bg-night text-paper">
      <div className="pointer-events-none absolute inset-x-2 top-20 -z-10 opacity-60 md:inset-x-auto md:right-[1%] md:top-24 md:w-[38%] md:opacity-100" aria-hidden="true">
        <CrossMachine u={u} buys={10} sells={6} />
        <p className="mt-2 hidden max-w-[44ch] text-sm text-paper/70 md:block">{caption(u, 10, 6, false)}</p>
      </div>
      <div className="relative z-10 mx-auto w-full max-w-[1100px] px-4 pb-20 pt-40 md:pb-28">
        <h1 className="max-w-[12ch] font-display text-[clamp(3.2rem,10vw,8.5rem)] leading-[0.95] tracking-tight">
          Monday&apos;s open, cleared once.
        </h1>
        <p className="mt-6 max-w-[46ch] text-lg text-paper/80">
          A Uniswap v4 hook that clears stock-token orders in one fair cross at the market open.
        </p>
        <div className="mt-9 flex flex-wrap items-center gap-4">
          <Link href="/app" className="rounded-lg bg-cobalt px-6 py-3 font-medium text-white transition-transform hover:-translate-y-0.5">
            Launch app
          </Link>
          <Link href="/#how" className="px-2 py-3 text-paper/80 underline-offset-4 hover:text-paper hover:underline">
            See how a cross works
          </Link>
        </div>
      </div>
    </section>
  );
}
