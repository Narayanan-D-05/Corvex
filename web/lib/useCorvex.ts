"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Address } from "viem";
import { hookAbi, lensAbi, oracleAbi, tokenAbi } from "./abis";
import { loadDeployment, poolKey, publicClient, type Deployment } from "./chain";

export type Snapshot = {
  mode: number;
  sessionId: bigint;
  poolPrice: bigint;
  liquidity: bigint;
  refPrice: bigint;
  darkRefPrice: bigint;
  crossPrice: bigint;
  multiplier: bigint;
  expectedMultiplier: bigint;
  darkFrom: number;
  reopenAt: number;
  awaitingSince: number;
  openOrders: bigint;
  totalOrders: bigint;
  marketOpen: boolean;
  oraclePaused: boolean;
  feedFresh: boolean;
  multiplierOk: boolean;
  plausible: boolean;
  scheduleClear: boolean;
  expired: boolean;
};

export type Order = {
  owner: Address;
  buy: boolean;
  status: number;
  srcSelector: bigint;
  amountIn: bigint;
  limitPrice: bigint;
};

export type Print = {
  token: Address;
  sessionId: bigint;
  kind: number;
  tokenPrice: bigint;
  multiplier: bigint;
  crossVolume: bigint;
  orderCount: number;
  timestamp: bigint;
  arb: number; // oracle status: 0 none, 1 recorded, 2 attested, 3 disputed
  base: number;
};

export type CrossLog = { price: bigint; volume: bigint; orders: number; donated0: bigint; donated1: bigint; sessionId: bigint };

export type State = {
  loading: boolean;
  error: string | null;
  deployment: Deployment | null;
  snap: Snapshot | null;
  orders: Order[];
  prints: Print[];
  crosses: CrossLog[];
  decimals: { stock: number; quote: number };
  stockIs0: boolean;
  updatedAt: number;
};

const empty: State = {
  loading: true,
  error: null,
  deployment: null,
  snap: null,
  orders: [],
  prints: [],
  crosses: [],
  decimals: { stock: 18, quote: 6 },
  stockIs0: true,
  updatedAt: 0,
};

export function useCorvex(intervalMs = 3000) {
  const [state, setState] = useState<State>(empty);
  const dep = useRef<Deployment | null>(null);

  const refresh = useCallback(async () => {
    try {
      if (!dep.current) {
        dep.current = await loadDeployment();
        if (!dep.current) throw new Error("No deployment found. Deploy the contracts first.");
      }
      const d = dep.current;
      const key = poolKey(d);
      const snap = (await publicClient.readContract({ address: d.lens, abi: lensAbi, functionName: "snapshot", args: [d.hook, key] })) as unknown as Snapshot;

      const [stockDec, quoteDec] = await Promise.all([
        publicClient.readContract({ address: d.stockToken, abi: tokenAbi, functionName: "decimals" }),
        publicClient.readContract({ address: d.quoteToken, abi: tokenAbi, functionName: "decimals" }),
      ]);

      const orders = (await publicClient.readContract({
        address: d.hook,
        abi: hookAbi,
        functionName: "getOrders",
        args: [d.poolId, snap.sessionId],
      })) as unknown as Order[];

      const prints: Print[] = [];
      const first = snap.sessionId > 2n ? snap.sessionId - 2n : 0n;
      for (let s = snap.sessionId; s >= first; s--) {
        for (const kind of [1, 0]) {
          const p = (await publicClient.readContract({ address: d.hook, abi: hookAbi, functionName: "getPrint", args: [d.poolId, s, kind] })) as unknown as Omit<Print, "arb" | "base">;
          if (p.timestamp === 0n) continue;
          const status = async (o?: Address) =>
            o ? Number(await publicClient.readContract({ address: o, abi: oracleAbi, functionName: "statusOf", args: [d.stockToken, s, kind] })) : 0;
          prints.push({ ...p, arb: await status(d.oracleArb), base: await status(d.oracleBase) });
        }
        if (s === 0n) break;
      }

      const logs = await publicClient.getContractEvents({ address: d.hook, abi: hookAbi, eventName: "CrossExecuted", fromBlock: 0n });
      const crosses = logs
        .map((l) => {
          const a = (l as unknown as { args: { price: bigint; volume: bigint; orders: number; donated0: bigint; donated1: bigint; sessionId: bigint } }).args;
          return { price: a.price, volume: a.volume, orders: Number(a.orders), donated0: a.donated0, donated1: a.donated1, sessionId: a.sessionId };
        })
        .reverse();

      setState({
        loading: false,
        error: null,
        deployment: d,
        snap,
        orders,
        prints,
        crosses,
        decimals: { stock: Number(stockDec), quote: Number(quoteDec) },
        stockIs0: d.currency0.toLowerCase() === d.stockToken.toLowerCase(),
        updatedAt: Date.now(),
      });
    } catch (e) {
      setState((s) => ({ ...s, loading: false, error: e instanceof Error ? e.message.split("\n")[0] : "Could not read the chain" }));
    }
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, intervalMs);
    return () => clearInterval(t);
  }, [refresh, intervalMs]);

  return { ...state, refresh };
}
