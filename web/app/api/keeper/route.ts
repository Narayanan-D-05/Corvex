import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { createPublicClient, createWalletClient, defineChain, http, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { feedAbi, hookAbi, lensAbi, marketAbi } from "@/lib/abis";
import { poolKey, RPC_URL, DEPLOYMENT, type Deployment } from "@/lib/chain";

/**
 * Testnet keeper: stands in for the exchange calendar and the price feed, which the mock contracts leave to one key.
 * The key never reaches the browser. It comes from KEEPER_PRIVATE_KEY, or from contracts/.env on your machine, and the
 * route only answers requests from localhost unless KEEPER_ALLOW_REMOTE=1.
 */
const testnet = defineChain({ id: 46630, name: "Robinhood Chain Testnet", nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [RPC_URL] } } });

function keeperKey(): Hex | null {
  let k = process.env.KEEPER_PRIVATE_KEY;
  if (!k) {
    try {
      const env = fs.readFileSync(path.join(process.cwd(), "..", "contracts", ".env"), "utf8");
      k = env.match(/^PRIVATE_KEY=(.+)$/m)?.[1]?.trim();
    } catch {
      return null;
    }
  }
  if (!k) return null;
  return (k.startsWith("0x") ? k : `0x${k}`) as Hex;
}

export async function POST(req: Request) {
  const host = req.headers.get("host") ?? "";
  if (!/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host) && process.env.KEEPER_ALLOW_REMOTE !== "1") {
    return NextResponse.json({ error: "The keeper only answers on localhost." }, { status: 403 });
  }
  if (DEPLOYMENT !== "robinhood-testnet") return NextResponse.json({ error: "The keeper is for the testnet deployment." }, { status: 400 });
  const key = keeperKey();
  if (!key) return NextResponse.json({ error: "No keeper key. Put PRIVATE_KEY in contracts/.env or set KEEPER_PRIVATE_KEY." }, { status: 503 });

  const body = (await req.json().catch(() => ({}))) as { action?: string; price?: number };
  if (body.action !== "close" && body.action !== "open") return NextResponse.json({ error: "action must be close or open" }, { status: 400 });

  const d = JSON.parse(fs.readFileSync(path.join(process.cwd(), "public", "deployments", "robinhood-testnet.json"), "utf8")) as Deployment;
  const pub = createPublicClient({ chain: testnet, transport: http(RPC_URL) });
  const wallet = createWalletClient({ account: privateKeyToAccount(key), chain: testnet, transport: http(RPC_URL) });
  const k = poolKey(d);
  const send = async (address: Hex, abi: readonly unknown[], functionName: string, args: readonly unknown[]) => {
    const hash = await wallet.writeContract({ address, abi, functionName, args, chain: testnet } as never);
    const r = await pub.waitForTransactionReceipt({ hash });
    if (r.status !== "success") throw new Error(`${functionName} reverted`);
    return hash;
  };

  try {
    const [, answer] = (await pub.readContract({ address: d.feed, abi: feedAbi, functionName: "latestRoundData" })) as readonly [bigint, bigint, bigint, bigint, bigint];
    const raw = body.price ? BigInt(Math.round(body.price * 1e8)) : answer;
    const txs: Hex[] = [];
    if (body.action === "close") {
      // a fresh price stamp first, so the pool goes dark because the market closed and not because the feed aged out
      txs.push(await send(d.feed, feedAbi, "setAnswer", [raw]));
      txs.push(await send(d.marketStatus, marketAbi, "setOpen", [false]));
      txs.push(await send(d.hook, hookAbi, "poke", [k]));
    } else {
      txs.push(await send(d.marketStatus, marketAbi, "setOpen", [true]));
      txs.push(await send(d.feed, feedAbi, "setAnswer", [raw]));
      txs.push(await send(d.hook, hookAbi, "poke", [k]));
      const snap = (await pub.readContract({ address: d.lens, abi: lensAbi, functionName: "snapshot", args: [d.hook, k] })) as unknown as { mode: number };
      if (snap.mode === 2) txs.push(await send(d.hook, hookAbi, "executeCross", [k]));
    }
    return NextResponse.json({ ok: true, txs });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message.split("\n")[0] : "Keeper failed" }, { status: 500 });
  }
}
