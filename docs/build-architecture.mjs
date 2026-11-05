// Generates docs/architecture.svg: a sharp-edged schematic with the real sponsor marks inlined.
//   node docs/build-architecture.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const brands = resolve(import.meta.dirname, "..", "web", "public", "brands");
const pathOf = (f) => readFileSync(resolve(brands, f), "utf8").match(/<path d="([^"]+)"/)[1];
const b64 = (f) => readFileSync(resolve(brands, f)).toString("base64");

const FONT = "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace";
const INK = "#10203a";
const SLATE = "#5c6b82";
const ACCENT = "#2650ff";

const marks = {
  chainlink: { vector: pathOf("chainlink.svg"), fill: "#375BD2" },
  robinhood: { vector: pathOf("robinhood.svg"), fill: "#CCFF00", bg: "#10203a" },
  uniswap: { png: b64("uniswap.png") },
  arbitrum: { png: b64("arbitrum.png") },
  base: { png: b64("base.png") },
};

function mark(name, x, y) {
  const m = marks[name];
  const id = `c-${name}-${x}-${y}`;
  const inner = m.png
    ? `<image href="data:image/png;base64,${m.png}" width="28" height="28"/>`
    : `<rect width="28" height="28" fill="${m.bg ?? "#fff"}"/><svg x="4" y="4" width="20" height="20" viewBox="0 0 24 24"><path d="${m.vector}" fill="${m.fill}"/></svg>`;
  return `<g transform="translate(${x},${y})"><clipPath id="${id}"><circle cx="14" cy="14" r="14"/></clipPath><g clip-path="url(#${id})">${inner}</g></g>`;
}

const box = (x, y, w, h, title, sub, logo, accent = false) => `
<g transform="translate(${x},${y})">
  <rect width="${w}" height="${h}" rx="0" fill="#fff" stroke="${accent ? ACCENT : INK}" stroke-width="${accent ? 1.8 : 1.2}"/>
  ${logo ? mark(logo, 12, (h - 28) / 2) : ""}
  <text x="${logo ? 50 : 14}" y="${h / 2 - 3}" font-family="${FONT}" font-size="13" fill="${INK}">${title}</text>
  <text x="${logo ? 50 : 14}" y="${h / 2 + 14}" font-family="${FONT}" font-size="10.5" fill="${SLATE}">${sub}</text>
</g>`;

const group = (x, y, w, h, label) => `
<g transform="translate(${x},${y})">
  <rect width="${w}" height="${h}" rx="0" fill="none" stroke="${SLATE}" stroke-width="1" stroke-dasharray="none"/>
  <text x="12" y="20" font-family="${FONT}" font-size="11" fill="${SLATE}">${label}</text>
</g>`;

const line = (pts, { accent = false, label, lx, ly } = {}) => {
  const d = pts.map((p, i) => `${i ? "L" : "M"}${p[0]} ${p[1]}`).join(" ");
  const c = accent ? ACCENT : INK;
  return `<path d="${d}" fill="none" stroke="${c}" stroke-width="${accent ? 1.8 : 1.2}" marker-end="url(#arrow${accent ? "-a" : ""})"/>${
    label ? `<text x="${lx}" y="${ly}" font-family="${FONT}" font-size="10" fill="${c}">${label}</text>` : ""
  }`;
};

const W = 1200, H = 700;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Corvex architecture">
<defs>
  <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="${INK}"/></marker>
  <marker id="arrow-a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="${ACCENT}"/></marker>
</defs>
<rect width="${W}" height="${H}" fill="#e8edf3"/>

${group(30, 30, 560, 250, "OFF-CHAIN")}
${box(50, 60, 340, 70, "market-data API", "official open and close, calendar")}
${box(50, 175, 340, 70, "session-attestor", "CRE workflow: attest + schedule", "chainlink")}

${group(30, 330, 560, 340, "ARBITRUM / BASE SEPOLIA")}
${mark("arbitrum", 546, 336)}
${box(50, 370, 250, 70, "SessionPrintOracle", "Recorded, Attested, Disputed", "chainlink")}
${box(320, 370, 250, 70, "ReopenController", "CRE consumer, sends schedule", "chainlink")}
${box(50, 490, 250, 70, "SessionLedger", "overnight + session sums")}
${box(320, 490, 250, 70, "OrderGateway", "USD + order over CCIP", "chainlink", true)}
${box(50, 590, 520, 60, "SessionPrintOracle (Base Sepolia)", "second destination for every print", "base")}

${group(660, 30, 510, 640, "ROBINHOOD CHAIN TESTNET")}
${mark("robinhood", 1124, 36)}
${box(690, 70, 450, 70, "ReopenReceiver", "checks source chain + sender", "chainlink", true)}
${box(690, 190, 450, 90, "ReopenCrossHook", "dark mode, queue, cross, auction, prints", "uniswap", true)}
${box(690, 330, 210, 70, "PoolManager", "swaps, donate()", "uniswap")}
${box(930, 330, 210, 70, "Feed + token", "price, pause, multiplier", "chainlink")}
${box(690, 585, 450, 70, "PrintBroadcaster", "one CCIP message per destination", "chainlink")}

${line([[220, 175], [220, 130]], { label: "official price", lx: 232, ly: 158 })}
${line([[150, 245], [150, 370]], { label: "verdict report", lx: 160, ly: 310 })}
${line([[360, 245], [360, 370]], { label: "schedule report", lx: 370, ly: 310 })}
${line([[175, 490], [175, 440]], { label: "reads attested", lx: 185, ly: 470 })}
${line([[570, 405], [625, 405], [625, 90], [690, 90]], { label: "CCIP schedule", lx: 535, ly: 396 })}
${line([[570, 525], [645, 525], [645, 118], [690, 118]], { accent: true, label: "CCIP order", lx: 580, ly: 517 })}
${line([[915, 140], [915, 190]], { accent: true })}
${line([[795, 280], [795, 330]], { accent: true, label: "cross, donate()", lx: 803, ly: 310 })}
${line([[1035, 330], [1035, 280]], { label: "reads", lx: 1043, ly: 310 })}
${line([[915, 280], [915, 585]], { label: "print", lx: 923, ly: 450 })}
${line([[690, 620], [570, 620]], { label: "CCIP print", lx: 604, ly: 612 })}
</svg>`;

writeFileSync(resolve(import.meta.dirname, "architecture.svg"), svg);
console.log("wrote docs/architecture.svg", svg.length, "bytes");
