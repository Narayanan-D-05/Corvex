import { HubDiagram } from "./HubDiagram";

export function Connected() {
  return (
    <section className="dark-ui relative isolate overflow-hidden border-y border-line">
      <div className="mx-auto max-w-[1200px] px-6 py-28">
        <div className="mx-auto max-w-[56ch] text-center">
          <p className="tag text-lime">[ Connected ]</p>
          <h2 className="mt-5 font-display text-5xl leading-[1.02] md:text-6xl">
            One hook, <span className="text-lime">every chain you need.</span>
          </h2>
          <p className="mt-6 text-lg text-slate">Chainlink brings the price and checks each print. CCIP carries it to Arbitrum and Base.</p>
        </div>
        <div className="mx-auto mt-14 max-w-[900px]">
          <HubDiagram />
        </div>
      </div>
    </section>
  );
}
