# Uniswap v4 developer feedback

Notes from building Corvex, a v4 hook that queues trades while a stock's reference price is dark and clears them in one uniform-price cross. These come from the places we lost time, not from a survey.

## What worked well

- **The hook surface is the right size.** `beforeSwap` with a return delta made an async queue possible without any change to the PoolManager. The same hook also overrides the dynamic fee, so one contract does the queue, the auction and the fee.
- **Flash accounting made the cross simple to reason about.** One `unlock` could pay in, run the two pool legs, donate the surplus to LPs and settle, with a single net transfer at the end.
- **`donate()` is a good primitive for fair surplus.** Sending the cross surplus to in-range LPs took a few lines.
- **Foundry and the test helpers.** `PoolSwapTest`, `PoolModifyLiquidityTest` and `HookMiner`-style mining let us run the whole system on anvil and on a testnet that has no v4.

## Friction we hit

1. **Contract size is the real ceiling.** Our hook is 24,376 of 24,576 bytes. We removed views and guards to fit, and moved logic into libraries and `via_ir`. A documented "hook size budget" and a pattern for splitting a hook (without proxies breaking the address-bit permissions) would help a lot.
2. **`initialize` takes no hook data.** `beforeInitialize` cannot receive pool configuration, so we had to add an owner-only `configure()` step before `initialize`. Letting `initialize` pass `hookData` through, as swaps and liquidity changes do, would remove a required ordering that is easy to get wrong.
3. **Hook address mining is a separate chore.** We wrote a CREATE2 miner and a factory. A canonical, audited miner and factory in `v4-periphery` (with a script template) would save every team a day.
4. **Custom accounting is easy to get subtly wrong.** The first version of our cross was insolvent by a few wei with a 6-decimal quote token because rounding went the wrong way. Fuzzing found it. A short guide on rounding direction for hooks that hold claims would have found it sooner.
5. **Exact-output swaps and async hooks do not mix well.** We had to reject exact-output swaps from the queue path. Guidance on which swap shapes an async hook should refuse would help.
6. **Test routers hide the real flow.** `PoolSwapTest` is convenient but does not reflect how a production router passes `hookData`. We decode `(owner, limit)` from hook data, and a reference router that forwards the end user's address would make that pattern safer.
7. **No v4 on some target chains.** Robinhood Chain Testnet has no PoolManager, so we deployed our own. A small "deploy v4 to a new chain" script and checklist would help teams building on new L2s.

## Suggestions

- A hook-author checklist for custody hooks: where tokens live, who can withdraw, how rounding is handled, what happens if the hook's own unlock reverts.
- An official example of a hook that stores claims (ERC-6909) and pays them out later, since several of the ideas people ask about need it.
- Publish gas and size numbers for the reference hooks so authors can see the budget before they start.
