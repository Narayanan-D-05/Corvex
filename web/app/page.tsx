import { Navbar } from "@/components/Navbar";
import { Hero } from "@/components/Hero";
import { Problem } from "@/components/Problem";
import { Story } from "@/components/Story";
import { Cta, Footer } from "@/components/Sections";
import { ReplayShowcase } from "@/components/ReplayShowcase";
import { Connected } from "@/components/Connected";
import { Faq } from "@/components/Faq";
import { CursorGlow, Marquee } from "@/components/Motion";

export default function Home() {
  return (
    <>
      <CursorGlow />
      <Navbar />
      <main>
        <Hero />
        <Marquee items={["Orders queue", "One fair price", "Surplus to LPs", "Priced by Chainlink", "Settled on-chain"]} />
        <Problem />
        <Story />
        <ReplayShowcase />
        <Connected />
        <Faq />
        <Cta />
      </main>
      <Footer />
    </>
  );
}
