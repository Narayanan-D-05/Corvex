/** The weekend that was played on the live testnets, as real transactions anyone can open. */
export type ProofStep = { what: string; chain: "robinhood" | "arbitrum" | "ccip"; id: string };

export const LIVE_PROOF: ProofStep[] = [
  { what: "Market closes, the pool goes dark", chain: "robinhood", id: "0xaf196f77cb37a43b139c1941d94d6f1e13e27217a6d5666aa6f1a70b8b956b59" },
  { what: "A large buy waits in the queue", chain: "robinhood", id: "0x8e4ea09f5658fd4824d28c4f9ce633d2cd7e0d6daeaacffe28ea2513d2628af3" },
  { what: "A small sell fills inside the band", chain: "robinhood", id: "0x9bad55631ae649d3c22d17f0d26019d2b8109091626b4257e7e198f0d3196eae" },
  { what: "Market reopens, the cross runs at 212", chain: "robinhood", id: "0xb3ec4153855acb82f41c2cca82c50cf8d70baac3643377187f88ae3fecefc7b7" },
  { what: "The open print reaches Arbitrum over CCIP", chain: "ccip", id: "0x1ad62e218f634a764a1153c07619091140f24eaf8cb4d7f7c74972dd00cdcfa3" },
  { what: "The open print reaches Base over CCIP", chain: "ccip", id: "0xbf492efcfa05f438635777763c28169d41f42eddc79111d8b66aced5997132c0" },
  { what: "Chainlink CRE attests the close print", chain: "arbitrum", id: "0x9ece53cd7a5f856e2d72fa8a73017ec646fe823fd5da1bcc99b445cdba0fd820" },
  { what: "Chainlink CRE attests the open print, 14 bps from the official open", chain: "arbitrum", id: "0x8ef5ce32cfa4389454a0c814bfa35170af7763a46d85d12e1a50aaebf5a0d07d" },
];

export function proofUrl(s: ProofStep): string {
  if (s.chain === "robinhood") return `https://explorer.testnet.chain.robinhood.com/tx/${s.id}`;
  if (s.chain === "arbitrum") return `https://sepolia.arbiscan.io/tx/${s.id}`;
  return `https://ccip.chain.link/msg/${s.id}`;
}
