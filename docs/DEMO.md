# Demo script: three minutes

For the submission video. Every step below runs today, on the live testnets or on a local chain.

## Before you record

1. Start from a settled pool. The live pool is Normal at about $212 right now. If a weekend has run since, settle it first, because a pool left in the gap auction is too far from its reference for the next close:
   ```
   STAGE=settle forge script script/TestnetScenario.s.sol --rpc-url $ROBINHOOD_TESTNET_RPC_URL --broadcast
   ```
2. Right before recording, close the market so a large order queues on camera. The mock price feed goes stale after an hour, and the hook goes dark on its own when that happens, so do this last:
   ```
   CLOSE_PRICE_USD=212 STAGE=close forge script script/TestnetScenario.s.sol --rpc-url $ROBINHOOD_TESTNET_RPC_URL --broadcast
   ```
   To reopen on camera with a gap: `OPEN_PRICE_USD=224 STAGE=open ...` (same command with `STAGE=open`).
3. Start the app in live mode: copy `web/.env.live.example` values into your shell, then `npm run dev` in `web`.
4. In a second terminal, start the mock price API for CRE: `node cre/mock-api/server.mjs`, and `export MARKET_DATA_API_KEY_VAR=mock-key`.
5. Have a wallet with a little Robinhood Testnet ETH. Connecting switches it to the right network.

## The video

| Time | On screen | Say |
|---|---|---|
| 0:00 | Landing page hero, then scroll into "How a cross works" | "Tokenized stocks trade all weekend. The price they track doesn't. LPs sell into stale quotes. Corvex is a Uniswap v4 hook that fixes that." |
| 0:25 | The pinned 3D scene: queue, cross, surplus to LPs, falling fee | "While the reference is dark, big orders queue. When it reopens, everything clears at one price, the surplus goes to LPs with `donate()`, and a falling fee closes the gap." |
| 0:50 | Console, Overview (live) | "This is Robinhood Chain Testnet. The pool is dark. Nothing fills at Friday's price." |
| 1:05 | Get test tokens, then Orders: place a large buy | "A large buy queues instead of trading. It is a claim, not a fill." |
| 1:25 | Run a cross (`STAGE=open` in the terminal, or "Run the cross" once the market has reopened) | "The market reopens. Anyone can run the cross. Four checks pass, orders clear at one price, the surplus goes to LPs." |
| 1:45 | Prints tab | "The hook records a Session Print and sends it over Chainlink CCIP to Arbitrum and Base." |
| 2:05 | Terminal: `cre workflow simulate session-attestor --target staging-settings --non-interactive --broadcast --trigger-index 0 --evm-tx-hash <delivery tx> --evm-event-index 0` | "A Chainlink CRE workflow checks the print against the official open from an external API and writes the verdict on-chain." |
| 2:25 | Prints tab again: Attested | "Attested, 14 basis points from the official open." |
| 2:40 | Orders: Cross-chain fills, Send back (use the local chain for this, where a mock CCIP token lane exists) | "Cross-chain orders come back to the buyer's own chain." |
| 2:50 | README: the Uniswap integration table | "Everything is open source, with the contract lines to check." |

## What each prize wants to see

- **Uniswap:** a v4 hook (dynamic fee, `beforeSwap` return delta, `donate()`), a public repo, `FEEDBACK.md`, and the feedback form.
- **Chainlink CRE:** the workflow integrates a chain with an external API and shows a successful simulation. The `--broadcast` step above is that proof.
- **Chainlink CCIP:** state changes on another chain made by CCIP messages: prints recorded, schedules applied, orders queued.

## If something goes wrong on camera

- **The pool isn't dark:** run the `STAGE=close` command again.
- **RPC is slow:** the console polls every few seconds; give it a moment.
- **A print hasn't arrived yet:** the Robinhood to Arbitrum lane can take a while to finalize. Show the CCIP explorer link from the weekend that already ran (listed on the Overview tab).
