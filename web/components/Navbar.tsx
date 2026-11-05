"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import { Wordmark } from "./Logo";

const links = [
  { href: "/#how", label: "How it works" },
  { href: "/replay", label: "Replay" },
  { href: "/docs", label: "Docs" },
];

/** Invisible over the hero; a detached floating bar once the hero is scrolled away. */
export function Navbar({ alwaysSolid = false }: { alwaysSolid?: boolean }) {
  const [scrolled, setScrolled] = useState(alwaysSolid);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (alwaysSolid) return;
    const onScroll = () => setScrolled(window.scrollY > window.innerHeight * 0.6);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [alwaysSolid]);

  const tone = scrolled ? "text-ink" : "text-paper";

  return (
    <header className={`fixed inset-x-0 top-0 z-50 flex justify-center transition-all duration-300 ease-out ${scrolled ? "pt-3" : "pt-6"}`}>
      <nav
        aria-label="Main"
        className={`flex w-[min(1100px,calc(100%-2rem))] items-center justify-between rounded-2xl border px-5 py-3 transition-all duration-300 ease-out ${tone} ${
          scrolled ? "border-line bg-paper/80 shadow-sm backdrop-blur-xl" : "border-transparent bg-transparent"
        }`}
      >
        <Link href="/" aria-label="Corvex home">
          <Wordmark />
        </Link>
        <div className="hidden items-center gap-7 md:flex">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="text-sm opacity-80 transition-opacity hover:opacity-100">
              {l.label}
            </Link>
          ))}
          <Link href="/app" className="rounded-lg bg-cobalt px-4 py-2 text-sm font-medium text-white transition-transform hover:-translate-y-0.5">
            Launch app
          </Link>
        </div>
        <button className="md:hidden" aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          {open ? <X /> : <Menu />}
        </button>
      </nav>
      {open && (
        <div className="absolute inset-x-4 top-[4.5rem] rounded-2xl border border-line bg-paper p-4 text-ink shadow-lg md:hidden">
          {links.map((l) => (
            <Link key={l.href} href={l.href} onClick={() => setOpen(false)} className="block rounded-lg px-3 py-3 text-base">
              {l.label}
            </Link>
          ))}
          <Link href="/app" onClick={() => setOpen(false)} className="mt-2 block rounded-lg bg-cobalt px-3 py-3 text-center font-medium text-white">
            Launch app
          </Link>
        </div>
      )}
    </header>
  );
}
