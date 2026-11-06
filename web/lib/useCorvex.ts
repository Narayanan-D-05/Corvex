"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Address } from "viem";
import { hookAbi, lensAbi, oracleAbi, receiverAbi, tokenAbi } from "./abis";
import { arbClient, baseClient, isLocal, loadDeployment, poolKey, publicClient, type Deployment } from "./chain";

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

/** One past or present session's queue: how many buys and sells it held and how they ended. */
export type SessionQueue = { id: bigint; buys: number; sells: number; open: number; buyIn: bigint; sellIn: bigint };

export type State = {
  loading: boolean;
  error: string | null;
  deployment: Deployment | null;
  snap: Snapshot | null;
  orders: Order[];
  /** the last few sessions that had orders, newest first */
  sessions: SessionQueue[];
  /** cross-chain orders are owned by a vault; this maps each vault to the user it belongs to */
  vaultUsers: Record<string, Address>;
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
  sessions: [],
  vaultUsers: {},
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

      const past: bigint[] = [];
      for (let s = snap.sessionId; s >= 0n && past.length < 5; s--) {
        past.push(s);
        if (s === 0n) break;
      }
      const sessions = (
        await Promise.all(
          past.map(async (id) => {
            const list = id === snap.sessionId ? orders : ((await publicClient.readContract({ address: d.hook, abi: hookAbi, functionName: "getOrders", args: [d.poolId, id] })) as unknown as Order[]);
            if (list.length === 0) return null;
            const buys = list.filter((o) => o.buy);
            const sells = list.filter((o) => !o.buy);
            return {
              id,
              buys: buys.length,
              sells: sells.length,
              open: list.filter((o) => o.status === 0).length,
              buyIn: buys.reduce((t, o) => t + o.amountIn, 0n),
              sellIn: sells.reduce((t, o) => t + o.amountIn, 0n),
            } satisfies SessionQueue;
          }),
        )
      ).filter((x): x is SessionQueue => x !== null);

      const vaultUsers: Record<string, Address> = {};
      const ccipOwners = [...new Set(orders.filter((o) => o.srcSelector !== 0n).map((o) => o.owner))];
      await Promise.all(
        ccipOwners.map(async (owner) => {
          const r = (await publicClient.readContract({ address: d.receiver, abi: receiverAbi, functionName: "routes", args: [owner] })) as readonly [bigint, Address];
          if (r[1] !== "0x0000000000000000000000000000000000000000") vaultUsers[owner.toLowerCase()] = r[1];
        }),
      );

      const status = async (o: Address | undefined, client: { readContract: typeof publicClient.readContract }, s: bigint, kind: number) => {
        if (!o) return 0;
        try {
          return Number(await client.readContract({ address: o, abi: oracleAbi, functionName: "statusOf", args: [d.stockToken, s, kind] }));
        } catch {
          return 0; // that chain's RPC is unreachable right now
        }
      };
      const first = snap.sessionId > 2n ? snap.sessionId - 2n : 0n;
      const pairs: [bigint, number][] = [];
      for (let s = snap.sessionId; s >= first; s--) {
        for (const kind of [1, 0]) pairs.push([s, kind]);
        if (s === 0n) break;
      }
      const found = await Promise.all(
        pairs.map(async ([s, kind]) => {
          const p = (await publicClient.readContract({ address: d.hook, abi: hookAbi, functionName: "getPrint", args: [d.poolId, s, kind] })) as unknown as Omit<Print, "arb" | "base">;
          if (p.timestamp === 0n) return null;
          const [arb, base] = await Promise.all([
            status(d.oracleArb, isLocal ? publicClient : arbClient, s, kind),
            status(d.oracleBase, isLocal ? publicClient : baseClient, s, kind),
          ]);
          return { ...p, arb, base } as Print;
        }),
      );
      const prints = found.filter((p): p is Print => p !== null);

      const logs = await publicClient.getContractEvents({ address: d.hook, abi: hookAbi, eventName: "CrossExecuted", fromBlock: BigInt(d.fromBlock ?? 0) });
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
        sessions,
        vaultUsers,
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
