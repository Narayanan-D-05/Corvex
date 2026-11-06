import { Navbar } from "@/components/Navbar";
import { Hero } from "@/components/Hero";
import { Problem } from "@/components/Problem";
import { Story } from "@/components/Story";
import { Cta, Footer } from "@/components/Sections";
import { ReplayShowcase } from "@/components/ReplayShowcase";
import { Connected } from "@/components/Connected";
import { Faq } from "@/components/Faq";

export default function Home() {
  return (
    <>
      <Navbar />
      <main>
        <Hero />
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
