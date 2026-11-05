import { Navbar } from "@/components/Navbar";
import { Hero } from "@/components/Hero";
import { Problem } from "@/components/Problem";
import { Story } from "@/components/Story";
import { BuiltOn, Cta, Footer, Proof } from "@/components/Sections";

export default function Home() {
  return (
    <>
      <Navbar />
      <main>
        <Hero />
        <Problem />
        <Story />
        <Proof />
        <BuiltOn />
        <Cta />
      </main>
      <Footer />
    </>
  );
}
