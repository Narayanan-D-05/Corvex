"use client";

import { useCallback, useEffect, useState } from "react";
import { createWalletClient, custom, http, type Address, type Abi } from "viem";
import { chain, isLocal, publicClient, RPC_URL } from "./chain";

type Eth = { request: (a: { method: string; params?: unknown[] }) => Promise<unknown> };

declare global {
  interface Window {
    ethereum?: Eth;
  }
}

/** One account at a time: an injected wallet, or on the local chain a node-managed demo account. */
export function useWallet() {
  const [account, setAccount] = useState<Address | null>(null);
  const [mode, setMode] = useState<"injected" | "demo" | null>(null);

  useEffect(() => {
    const saved = sessionStorage.getItem("corvex.demo");
    if (isLocal && saved) {
      setAccount(saved as Address);
      setMode("demo");
    }
  }, []);

  const connect = useCallback(async () => {
    if (!window.ethereum) throw new Error("No wallet found. Install a browser wallet or use a demo account.");
    const accounts = (await window.ethereum.request({ method: "eth_requestAccounts" })) as Address[];
    setAccount(accounts[0]);
    setMode("injected");
    sessionStorage.removeItem("corvex.demo");
  }, []);

  const useDemo = useCallback((a: Address) => {
    sessionStorage.setItem("corvex.demo", a);
    setAccount(a);
    setMode("demo");
  }, []);

  const disconnect = useCallback(() => {
    sessionStorage.removeItem("corvex.demo");
    setAccount(null);
    setMode(null);
  }, []);

  const client = useCallback(
    (as?: Address) => {
      const acct = as ?? account;
      if (!acct) throw new Error("Connect a wallet first.");
      if (mode === "demo" || as) return createWalletClient({ account: acct, chain, transport: http(RPC_URL) });
      return createWalletClient({ account: acct, chain, transport: custom(window.ethereum!) });
    },
    [account, mode],
  );

  /** Sends a transaction and waits for the receipt. `as` forces a specific unlocked account (local demo only). */
  const write = useCallback(
    async (p: { address: Address; abi: Abi; functionName: string; args?: readonly unknown[]; value?: bigint; as?: Address }) => {
      const c = client(p.as);
      const hash = await c.writeContract({
        address: p.address,
        abi: p.abi,
        functionName: p.functionName,
        args: p.args,
        value: p.value,
        chain,
        account: c.account!,
      } as never);
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error("Transaction reverted");
      return hash;
    },
    [client],
  );

  return { account, mode, connect, useDemo, disconnect, write };
}
