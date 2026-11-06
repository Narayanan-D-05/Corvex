"use client";

import { useCallback, useEffect, useState } from "react";
import { createWalletClient, custom, http, type Address, type Abi } from "viem";
import { chain, EXPLORER, isLocal, publicClient, RPC_URL } from "./chain";

type Eth = { request: (a: { method: string; params?: unknown[] }) => Promise<unknown> };

declare global {
  interface Window {
    ethereum?: Eth;
  }
}

/** Moves an injected wallet onto the app's chain, adding it first if the wallet has never seen it. */
async function ensureChain(eth: Eth) {
  const chainId = `0x${chain.id.toString(16)}`;
  try {
    await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId }] });
  } catch (e) {
    if ((e as { code?: number }).code !== 4902) throw e;
    await eth.request({
      method: "wallet_addEthereumChain",
      params: [{ chainId, chainName: chain.name, nativeCurrency: chain.nativeCurrency, rpcUrls: [RPC_URL], blockExplorerUrls: EXPLORER ? [EXPLORER] : [] }],
    });
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
    if (!isLocal) await ensureChain(window.ethereum);
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
      const req = { address: p.address, abi: p.abi, functionName: p.functionName, args: p.args, value: p.value, account: c.account! };
      // estimate first: a revert shows its reason here instead of as a wallet warning, and the gas limit gets some headroom
      let gas: bigint;
      try {
        gas = ((await publicClient.estimateContractGas(req as never)) * 13n) / 10n;
      } catch (e) {
        throw new Error((e as { shortMessage?: string }).shortMessage ?? (e instanceof Error ? e.message.split("\n")[0] : "The transaction would fail"));
      }
      const hash = await c.writeContract({ ...req, gas, chain } as never);
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error("Transaction reverted");
      return hash;
    },
    [client],
  );

  return { account, mode, connect, useDemo, disconnect, write };
}
