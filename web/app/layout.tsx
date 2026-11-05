import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Instrument_Serif, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const display = Instrument_Serif({ variable: "--font-instrument", subsets: ["latin"], weight: "400", style: ["normal", "italic"] });
const sans = Bricolage_Grotesque({ variable: "--font-bricolage", subsets: ["latin"] });
const mono = JetBrains_Mono({ variable: "--font-jetbrains", subsets: ["latin"] });

const title = "Corvex";
const description = "Monday's open, cleared once. A Uniswap v4 hook that clears stock-token orders in one fair cross at the market open.";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: { default: `${title}: Monday's open, cleared once`, template: `%s | ${title}` },
  description,
  openGraph: { title: `${title}: Monday's open, cleared once`, description, type: "website" },
  twitter: { card: "summary_large_image", title: `${title}: Monday's open, cleared once`, description },
};

export const viewport: Viewport = { themeColor: "#0b1730" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable} ${mono.variable} antialiased`}>
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
