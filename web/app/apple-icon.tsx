import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#0b1730" }}>
        <svg width="120" height="120" viewBox="0 0 64 64" fill="none" stroke="#e8edf3" strokeWidth="5" strokeLinecap="round">
          <path d="M6 12 L40 32" />
          <path d="M6 52 L40 32" />
          <path d="M6 32 H58" />
          <circle cx="40" cy="32" r="5.5" fill="#2650ff" stroke="none" />
        </svg>
      </div>
    ),
    size,
  );
}
