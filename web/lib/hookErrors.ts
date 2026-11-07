/**
 * Uniswap v4 wraps every revert from a hook in WrappedError(target, hookCallback, reason, details), so a wallet or viem
 * only sees the wrapper's selector, 0x90bfb865. This reads the real reason out of it.
 */
const WRAPPED = "90bfb865";

const reasons: Record<string, string> = {
  "832ce88c": "The pool price is more than 2% away from the dark reference price, so the hook blocks every swap. This happens if the market is closed while the pool is still in a gap auction. Reopen the market at the pool's price to reset it.",
  "5c78c9a2": "The market has reopened but the cross has not run yet. Press Run the cross first.",
  "8acb5f27": "The queue is full (50 open orders). Wait for the cross, or cancel an order.",
};

export function explainRevert(err: unknown): string | null {
  const seen = new Set<unknown>();
  const texts: string[] = [];
  let e: unknown = err;
  while (e && typeof e === "object" && !seen.has(e)) {
    seen.add(e);
    const o = e as { message?: string; data?: unknown; cause?: unknown };
    if (typeof o.message === "string") texts.push(o.message);
    if (typeof o.data === "string") texts.push(o.data);
    e = o.cause;
  }
  const hay = texts.join(" ");
  const at = hay.indexOf(WRAPPED);
  if (at === -1) return null;
  const hex = (hay.slice(at + 8).match(/^[0-9a-fA-F]+/)?.[0] ?? "").toLowerCase();
  // WrappedError(address target, bytes4 callback, bytes reason, bytes details): the reason starts at its length word
  const word = (i: number) => hex.slice(i * 64, i * 64 + 64);
  const off = parseInt(word(2) || "0", 16) / 32;
  const len = parseInt(word(off) || "0", 16);
  const reason = (hex.slice((off + 1) * 64) || "").slice(0, len * 2);
  return reasons[reason.slice(0, 8)] ?? `The hook rejected the swap (error 0x${reason.slice(0, 8) || "unknown"}).`;
}
