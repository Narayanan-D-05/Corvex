import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const sans = Geist({ variable: "--font-geist", subsets: ["latin"] });
const mono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

const title = "Corvex";
const description = "One fair price for every open. A Uniswap v4 hook that clears stock-token orders in one fair cross at the market open.";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: { default: `${title}: One fair price for every open`, template: `%s | ${title}` },
  description,
  openGraph: { title: `${title}: One fair price for every open`, description, type: "website" },
  twitter: { card: "summary_large_image", title: `${title}: One fair price for every open`, description },
};

export const viewport: Viewport = { themeColor: "#0b1713" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable} antialiased`}>
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
