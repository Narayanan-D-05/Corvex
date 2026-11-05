import { createPublicClient, defineChain, http, type Address, type Hex } from "viem";

export const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL ?? "http://127.0.0.1:8545";
export const DEPLOYMENT = process.env.NEXT_PUBLIC_DEPLOYMENT ?? "local";

export type Deployment = {
  poolManager: Address;
  liquidityRouter: Address;
  swapRouter: Address;
  stockToken: Address;
  quoteToken: Address;
  feed: Address;
  marketStatus: Address;
  hook: Address;
  broadcaster: Address;
  receiver: Address;
  lens: Address;
  poolId: Hex;
  currency0: Address;
  currency1: Address;
  // present on the local deployment, where one chain plays every chain
  oracleArb?: Address;
  oracleBase?: Address;
  gatewayBase?: Address;
  ledger?: Address;
  controller?: Address;
};

export async function loadDeployment(): Promise<Deployment | null> {
  try {
    const res = await fetch(`/deployments/${DEPLOYMENT}.json`, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as Deployment;
  } catch {
    return null;
  }
}

export const chain = defineChain({
  id: DEPLOYMENT === "local" ? 31337 : 46630,
  name: DEPLOYMENT === "local" ? "Local anvil" : "Robinhood Chain Testnet",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
});

export const publicClient = createPublicClient({ chain, transport: http(RPC_URL) });

export const isLocal = DEPLOYMENT === "local";

export function poolKey(d: Deployment) {
  return {
    currency0: d.currency0,
    currency1: d.currency1,
    fee: 0x800000,
    tickSpacing: 60,
    hooks: d.hook,
  } as const;
}

export const MODES = ["Normal", "Dark", "Awaiting reopen", "Auction"] as const;

/** 18-decimal price as a plain number string, for display. */
export function fmtPrice(p: bigint, digits = 2): string {
  const n = Number(p) / 1e18;
  return n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function fmtUnits(v: bigint, decimals: number, digits = 2): string {
  const n = Number(v) / 10 ** decimals;
  return n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function short(a: string): string {
  return `${a.slice(0, 6)}...${a.slice(-4)}`;
}

/** Anvil's well-known test accounts, offered as demo wallets on the local chain only. */
export const DEMO_ACCOUNTS: Address[] = [
  "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
  "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
  "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
  "0x90F79bf6EB2c4f870365E785982E1f101E93b906",
];
