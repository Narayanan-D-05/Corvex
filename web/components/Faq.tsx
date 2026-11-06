import Link from "next/link";

const items = [
  { q: "What happens to my trade while the market is closed?", a: "A trade that keeps the pool price within 2% of Friday's close fills straight away. A bigger one is held as a claim in the queue and clears at the open." },
  { q: "How is the cross price decided?", a: "It is the price from the reference feed once the market is back. Orders whose limit price allows it fill at that price, and the rest are refunded in full." },
  { q: "Who gets the surplus?", a: "The pool leg of the cross usually costs less than what traders paid at the cross price. That difference is donated to the pool's LPs with donate()." },
  { q: "What if the stock splits?", a: "The cross will not run until the oracle is unpaused and the token's multiplier matches the announced split, so a split day never shows a fake 50% move." },
  { q: "Is this running live?", a: "It runs on Robinhood Chain Testnet, Arbitrum Sepolia and Base Sepolia with mock tokens and a mock price feed. Every step in the demo weekend is a real transaction." },
];

export function Faq() {
  return (
    <section className="dark-ui relative isolate overflow-hidden">
      <div aria-hidden="true" className="columns pointer-events-none absolute inset-y-0 left-1/2 -z-10 w-[min(1200px,100%)] -translate-x-1/2" />
      <div className="mx-auto grid max-w-[1200px] gap-14 px-6 py-28 lg:grid-cols-[0.8fr_1.2fr]">
        <div>
          <p className="tag text-lime">[ Questions ]</p>
          <h2 className="mt-5 font-display text-5xl leading-[1.02] md:text-6xl">
            What do you <span className="text-lime">need to know?</span>
          </h2>
          <p className="mt-6 max-w-[36ch] text-slate">The short answers. The docs have the rest.</p>
          <Link href="/docs" className="tag lift mt-8 inline-block rounded-md border border-white/20 px-6 py-3.5 hover:border-white/50">
            Read the docs
          </Link>
        </div>
        <div className="space-y-3">
          {items.map((it) => (
            <details key={it.q} className="group rounded-xl border border-line bg-paper-2 transition-colors open:border-lime/40">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 font-medium [&::-webkit-details-marker]:hidden">
                {it.q}
                <span aria-hidden="true" className="text-lime transition-transform duration-200 group-open:rotate-45">+</span>
              </summary>
              <p className="max-w-[60ch] px-5 pb-5 text-slate">{it.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
