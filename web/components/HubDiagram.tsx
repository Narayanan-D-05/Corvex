"use client";

import { useEffect, useState } from "react";

/** The pieces Corvex connects, as a hub with pulses running along the lines. */
const left = [
  { name: "Robinhood Chain", note: "Pool and hook", src: "/brands/robinhood.svg" },
  { name: "Uniswap v4", note: "Swaps and donate()", src: "/brands/uniswap.png" },
  { name: "Data Feeds", note: "The reference price", src: "/brands/chainlink.svg" },
  { name: "CRE", note: "Checks each print", src: "/brands/chainlink.svg" },
];
const right = [
  { name: "Arbitrum Sepolia", note: "Prints and schedule", src: "/brands/arbitrum.png" },
  { name: "Base Sepolia", note: "Prints and orders", src: "/brands/base.png" },
];

const LX = 20, TW = 236, TH = 64, HUB = { x: 400, y: 200 };
const ly = (i: number) => 28 + i * 86;
const ry = (i: number) => 98 + i * 124;

export function HubDiagram() {
  const [motion, setMotion] = useState(false);
  useEffect(() => setMotion(!window.matchMedia("(prefers-reduced-motion: reduce)").matches), []);

  const inPaths = left.map((_, i) => `M${LX + TW} ${ly(i) + TH / 2} C 340 ${ly(i) + TH / 2}, 340 ${HUB.y}, ${HUB.x - 52} ${HUB.y}`);
  const outPaths = right.map((_, i) => `M${HUB.x + 52} ${HUB.y} C 460 ${HUB.y}, 460 ${ry(i) + TH / 2}, ${800 - LX - TW} ${ry(i) + TH / 2}`);

  return (
    <svg viewBox="0 0 800 400" className="h-auto w-full" role="img" aria-label="Corvex sits between Robinhood Chain, Uniswap v4, Chainlink Data Feeds and CRE on one side, and Arbitrum and Base on the other">
      {[...inPaths, ...outPaths].map((d, i) => (
        <g key={i}>
          <path d={d} fill="none" stroke="rgba(232,238,228,0.18)" strokeWidth="1.5" />
          {motion && (
            <circle r="4" fill="#c9ff5c">
              <animateMotion dur="3s" begin={`${(i % 4) * 0.7}s`} repeatCount="indefinite" path={d} />
            </circle>
          )}
        </g>
      ))}

      {left.map((t, i) => (
        <Tile key={t.name} x={LX} y={ly(i)} {...t} />
      ))}
      {right.map((t, i) => (
        <Tile key={t.name} x={800 - LX - TW} y={ry(i)} {...t} />
      ))}

      <g>
        <rect x={HUB.x - 52} y={HUB.y - 52} width="104" height="104" rx="22" fill="#c9ff5c" />
        <g transform={`translate(${HUB.x - 26} ${HUB.y - 26}) scale(0.8)`} fill="none" stroke="#0b1713" strokeWidth="5" strokeLinecap="round">
          <path d="M6 12 L40 32" />
          <path d="M6 52 L40 32" />
          <path d="M6 32 H58" />
          <circle cx="40" cy="32" r="5.5" fill="#0b1713" stroke="none" />
        </g>
        <text x={HUB.x} y={HUB.y + 76} textAnchor="middle" fill="#e8eee4" fontSize="15" fontWeight="600">Corvex</text>
      </g>
    </svg>
  );
}

function Tile({ x, y, name, note, src }: { x: number; y: number; name: string; note: string; src: string }) {
  return (
    <g>
      <rect x={x} y={y} width={TW} height={TH} rx="14" fill="#12241e" stroke="rgba(232,238,228,0.14)" />
      <rect x={x + 14} y={y + 14} width="36" height="36" rx="9" fill="#ffffff" />
      <image href={src} x={x + 21} y={y + 21} width="22" height="22" />
      <text x={x + 62} y={y + 29} fill="#e8eee4" fontSize="15" fontWeight="600">{name}</text>
      <text x={x + 62} y={y + 48} fill="#8da398" fontSize="12.5">{note}</text>
    </g>
  );
}
