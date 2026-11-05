import type { Metadata } from "next";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Sections";

export const metadata: Metadata = { title: "Docs" };

const sections = [
  {
    title: "The hook",
    body: [
      "ReopenCrossHook is a Uniswap v4 hook with a dynamic fee. It moves a pool between four modes: Normal, Dark, Awaiting reopen and Auction.",
      "The pool goes dark when the market closes, the token oracle pauses, the feed goes stale, or a CCIP schedule says so. While dark, trades that stay within 2% of the last price execute. Larger exact-input trades are taken as claims and queued, up to 50 per pool.",
      "Once the reference is back, swaps revert until executeCross runs. The cross needs four checks: the session is open, the oracle is not paused, the feed is fresh, and the new price is within 20% of the old one. If a split is scheduled, the token's multiplier must also have changed.",
    ],
  },
  {
    title: "The cross",
    body: [
      "executeCross is permissionless. It sets one price from the reference feed, fills every order whose limit crosses it, and refunds the rest. Buys net against sells, and only the imbalance trades against the pool, never past the cross price.",
      "Fillers pay the cross price. The pool leg usually costs less, and the difference is donated to LPs. A fill that cannot be completed in full is scaled down and the rest refunded. Everything is paid out as claims you withdraw.",
    ],
  },
  {
    title: "Session Prints",
    body: [
      "Entering dark records a closing print, and a cross records an opening print. A print stores the token price and the multiplier, so a split never shows up as a fake 50% move.",
      "The PrintBroadcaster sends each print over CCIP to a SessionPrintOracle on Arbitrum Sepolia and Base Sepolia, where it starts as Recorded. A Chainlink CRE workflow compares it with the official open or close and writes Attested or Disputed. Consumers read only attested prints.",
    ],
  },
  {
    title: "Chainlink",
    body: [
      "CCIP carries prints out, schedules in, and cross-chain orders in. Every receiver checks the source chain and sender.",
      "The session-attestor CRE workflow has two handlers: an EVM log trigger that attests prints, and a five-minute cron that builds the reopen schedule from an exchange calendar.",
    ],
  },
  {
    title: "Limits",
    body: [
      "This is a hackathon build with no audit. The queue is capped, and the market status contract is a keeper-driven stand-in for a Data Streams adapter. The replay numbers come from mocks, not the real June 26 weekend.",
    ],
  },
];

export default function Docs() {
  return (
    <>
      <Navbar alwaysSolid />
      <main className="mx-auto max-w-[760px] px-4 pb-24 pt-32">
        <h1 className="font-display text-6xl leading-none md:text-7xl">Docs</h1>
        <p className="mt-5 text-lg text-slate">How Corvex works, end to end.</p>
        {sections.map((s) => (
          <section key={s.title} className="mt-14">
            <h2 className="font-display text-4xl">{s.title}</h2>
            {s.body.map((p, i) => (
              <p key={i} className="mt-4 leading-[1.7]">{p}</p>
            ))}
          </section>
        ))}
      </main>
      <Footer />
    </>
  );
}
