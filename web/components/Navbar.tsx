"use client";

import Link from "next/link";
import { useState } from "react";
import { Menu, X } from "lucide-react";
import { Wordmark } from "./Logo";

const links = [
  { href: "/#how", label: "How it works" },
  { href: "/replay", label: "Replay" },
  { href: "/docs", label: "Docs" },
];

/** A logo chip on the left and a pill of links on the right, over every page. */
export function Navbar() {
  const [open, setOpen] = useState(false);

  return (
    <header className="fixed inset-x-0 top-0 z-50 px-4 pt-4 text-snow">
      <div className="mx-auto flex max-w-[1200px] items-center justify-between">
        <Link href="/" aria-label="Corvex home" className="lift rounded-lg border border-white/10 bg-night/80 px-3 py-2 text-lime backdrop-blur-xl">
          <Wordmark />
        </Link>
        <nav aria-label="Main" className="hidden items-center gap-1 rounded-lg border border-white/10 bg-night/80 p-1 backdrop-blur-xl md:flex">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="tag rounded-md px-4 py-2.5 text-snow/80 transition-colors hover:bg-white/10 hover:text-snow">
              {l.label}
            </Link>
          ))}
          <Link href="/app" className="tag lift rounded-md bg-lime px-4 py-2.5 text-night hover:bg-[#d8ff86]">
            Launch app
          </Link>
        </nav>
        <button className="rounded-lg border border-white/10 bg-night/80 p-2.5 backdrop-blur-xl md:hidden" aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          {open ? <X /> : <Menu />}
        </button>
      </div>
      {open && (
        <div className="mx-auto mt-2 max-w-[1200px] rounded-xl border border-white/10 bg-night p-3 md:hidden">
          {links.map((l) => (
            <Link key={l.href} href={l.href} onClick={() => setOpen(false)} className="tag block rounded-md px-3 py-3.5">
              {l.label}
            </Link>
          ))}
          <Link href="/app" onClick={() => setOpen(false)} className="tag mt-2 block rounded-md bg-lime px-3 py-3.5 text-center text-night">
            Launch app
          </Link>
        </div>
      )}
    </header>
  );
}
