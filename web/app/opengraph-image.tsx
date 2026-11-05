import { ImageResponse } from "next/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Corvex: Monday's open, cleared once";

export default function Image() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: "#0b1730", color: "#e8edf3", padding: 72 }}>
        <svg width="96" height="96" viewBox="0 0 64 64" fill="none" stroke="#e8edf3" strokeWidth="5" strokeLinecap="round">
          <path d="M6 12 L40 32" />
          <path d="M6 52 L40 32" />
          <path d="M6 32 H58" />
          <circle cx="40" cy="32" r="5.5" fill="#2650ff" stroke="none" />
        </svg>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 104, lineHeight: 1.05, fontFamily: "serif" }}>Monday&apos;s open, cleared once.</div>
          <div style={{ fontSize: 36, marginTop: 24, color: "#9fb0cc" }}>Uniswap v4 Hooks for tokenized stocks. Corvex.</div>
        </div>
      </div>
    ),
    size,
  );
}
