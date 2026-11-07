# Corvex: what to say

Two parts. The pitch is the spoken story (about 3 minutes). The demo is what you click while you talk (about 5 minutes live, or the 3-minute cut marked in each scene). Read it aloud once. Short sentences, no jargon until you have explained it.

## The three things to remember

1. **The problem:** the stock market closes, but stock tokens keep trading, so LPs sell into old prices and a bot takes the gap on Monday.
2. **The fix:** queue big orders while the price is dark, then clear them all at **one fair price** when it returns. Only the net touches the pool, and the surplus goes to LPs.
3. **The proof:** it runs on real testnets. Chainlink delivers the price, carries each print across chains with CCIP, and checks it with CRE.

---

## Part 1: The pitch

### Opening (15 seconds)

"Stock markets close every Friday evening. Tokenized stocks don't. They trade all weekend. And that mismatch is quietly costing liquidity providers money."

### The problem (40 seconds)

"Picture a Tesla token pool on Saturday. The real price is frozen at Friday's close, but people keep trading against it. On Monday morning the news lands and the real price jumps six percent in one move.

"The first bot to arrive buys the whole gap from the pool at Friday's price. That profit comes straight out of the liquidity providers. The research we quote says 97.6 percent of the S&P 500's long-run gain happens between the close and the open. So this is not an edge case. It is where the money is.

"A normal fee hook doesn't fix this. It charges everybody a bit more, it punishes ordinary traders, and the bot still gets the gap."

### The idea (40 seconds)

"Corvex is a Uniswap v4 hook. It gives the pool three modes.

"When the price is live, the pool trades normally.

"When the price goes dark, small trades that keep the price inside a two percent band still fill. Bigger trades are not rejected. They are taken as claims and put in a queue. Nothing fills at a stale price.

"When the price comes back, anyone can run the cross. It sets one price for the whole queue, matches buyers against sellers directly, sends only the leftover to the pool, and never past that price. Whatever the pool leg saved is donated to the liquidity providers. Then a falling fee closes what is left of the gap."

### How it works (40 seconds)

"Three pieces make it work.

"Uniswap v4 does the heavy lifting: the hook, the dynamic fee, the queue held as claims inside the pool manager, and the donate call that pays the LPs.

"Chainlink Data Feeds give the reference price, so the hook knows when the price is stale and what the cross price is.

"And every open and close is recorded as a Session Print. Chainlink CCIP carries each print to Arbitrum and Base. Then a Chainlink CRE workflow checks it against the official exchange price and marks it Attested or Disputed. So other chains can trust the price a stock opened at."

### The proof (25 seconds)

"We replayed the same weekend through three pools. With no hook, LPs lose 115 dollars. With the queue, they lose nothing. In the case with no queued orders, the falling fee takes a loss of 157 dollars down to under 3.

"The contracts have 104 passing tests, the CRE logic has 13, and there are end-to-end browser tests of the whole weekend. And I'll show it running live on testnet now."

### Transition into the demo (5 seconds)

"This is the console. This is Robinhood Chain Testnet, with a real v4 pool and the real hook."

---

## Part 2: The live demo in the app

### Before you go on (do this 5 minutes earlier)

1. In a terminal: `cd web`, then `npm run dev`. Open http://localhost:3000/app.
2. Make sure the pool is **Normal at about $212**: set **Price** to `212` and press **Reopen market**. If the banner says **Auction**, make one small buy so it returns to Normal.
3. Fresh feed: Close or Reopen both refresh it. Do this just before you start, because the mock feed goes stale after an hour.
4. MetaMask is on Robinhood Chain Testnet with a little ETH, and your wallet already holds test tokens (press **Get test tokens** earlier if not).
5. Optional, for the Chainlink scene: `node cre/mock-api/server.mjs` running in one terminal.
6. Open a second tab on the landing page for the opening and the replay.

### Scene 1: the landing page (0:00 to 0:30, in the 3-minute cut too)

**Do:** show the landing page. Let the card in the hero move with your cursor. Scroll down to "How a cross works".

**Say:** "This is the product. On the right is a live view of a cross: orders waiting, matching, and settling at one price. Here is the same thing explained in four steps. The market closes, orders queue, one cross clears them, and the surplus goes to LPs."

### Scene 2: open the console and connect (0:30 to 0:55)

**Do:** click **Launch app**. Point at the four prices. Click **Connect wallet**, approve in MetaMask.

**Say:** "This is the Trade page. At the top is the state of the pool: the pool price, the reference price from the feed, the gap, and the price of the last cross. The pool is Normal and the gap is almost zero.

"I'll connect a wallet. MetaMask switches to Robinhood Chain Testnet."

**If it is slow:** "The testnet has one-second blocks, but the wallet popup is the slow part."

### Scene 3: a normal trade (0:55 to 1:20)

**Do:** in **Place order**, choose Buy TSLA, click **100 Small, fills now**, press **Place order**. Confirm the approval, then confirm the swap.

**Say:** "A small buy while the market is open is just a Uniswap swap. It fills at once, and notice the approval is for exactly this amount, not unlimited."

**If it is slow:** "Meanwhile, the hook is checking the market status and the feed on every swap, so it always knows which mode it is in."

### Scene 4: the market closes (1:20 to 1:40)

**Do:** click **Close market** in the market controls. Wait for the banner to say **Dark**.

**Say:** "Now the exchange closes. The pool goes dark. The hook switches to dark mode and records a closing print. A small trade still works, because it stays inside the two percent band. But a big trade will not fill at Friday's price."

**If it is slow:** "The keeper is writing the market status and a fresh price on chain. In production that would be a Chainlink Data Streams adapter."

### Scene 5: queue the big orders (1:40 to 2:30)

**Do:** Buy TSLA, click **3000 Large, queues when closed**. Point at the hint ("Queues until the open") and the button text, **Queue order**. Place it. Do it a second time. Then choose **Sell TSLA**, click **15 Large**, and queue it.

**Say:** "A large buy would move the price past the band, so the form tells me it will queue. It does not fail. It becomes a claim.

"Two big buys, one big sell. Look at Queue status. Two buys waiting, one sell. The tile shows how this will clear: this much will match directly, buyer against seller, with no pool and no fee. And only this much goes to the pool."

**Point at:** the green and blue bar in Queue status.

### Scene 6: the market reopens and the cross (2:30 to 3:10, in the 3-minute cut too)

**Do:** set **Price** to `224` and click **Reopen market**. Wait. If the banner stops at **Awaiting reopen**, click **Run the cross** and confirm in MetaMask.

**Say:** "Monday morning. The price is back, and it has jumped from 212 to 224. Look at what the pool does: nothing. Swaps are paused until the cross runs, so nobody can trade against the stale price in between.

"Now anyone can run the cross. It sets one price, 224. The buys and the sell match each other directly. Only the leftover buy goes to the pool, along the curve from 212 up to 224, never past it."

**Point at:** the queue rows changing to **Settled**, and the banner changing to **Auction**.

### Scene 7: claims and the LP payout (3:10 to 3:50)

**Do:** in the Queue tile, find **Your claims** and click **Withdraw** on each, confirming in MetaMask. Then click the **Liquidity** tab.

**Say:** "My fills are claims, and I withdraw them. The buyers got TSLA at 224. The seller got USDG at 224.

"And here is the part that matters to LPs. On the Liquidity page, this row is the cross we just ran. Buyers paid 224 for every token, but the pool sold them along the curve, below 224 on average. That difference is the surplus. It was donated to the pool, and it shows up here as 'Paid to LPs'. That is money the bot used to take."

**Point at:** the top-right tile, **Paid to LPs by crosses**, and the new row in **Past crosses**.

### Scene 8: Chainlink prints (3:50 to 4:30)

**Do:** click the **Prints** tab. Point at the newest Market close and Market open cards.

**Say:** "Every close and open is a Session Print. The hook sent each one over Chainlink CCIP to Arbitrum and Base. It takes fifteen to thirty minutes for Robinhood Chain to finalize, so a fresh one says in transit. The earlier ones are delivered.

"On Arbitrum, a Chainlink CRE workflow fetches the official price from an external API and compares it with the print. When it agrees, the print becomes Attested."

**Optional, if one is delivered:** in a terminal, run `cre workflow simulate session-attestor --target staging-settings --non-interactive --broadcast --trigger-index 0 --evm-tx-hash <delivery tx> --evm-event-index 0`, then refresh Prints. The Arbitrum row says **Attested**.

### Scene 9: the replay (4:30 to 5:00, in the 3-minute cut too)

**Do:** go back to the landing page and scroll to the replay. Let it play. Point at the profit and loss numbers as they move.

**Say:** "This replays a whole weekend. The coral line is a pool with no hook. Watch the numbers on the right move with the graph. With no hook, LPs lose 115 dollars. The amber line is a fee-only hook, an illustrative baseline. Corvex ends at zero. The orders in the queue slide to one price at the cross, and the LPs keep the gap."

---

## Closing (20 seconds)

"So that is Corvex. One fair price for every open. Uniswap v4 does the queue, the cross and the payout. Chainlink brings the price, carries it across chains, and checks it. Everything runs on testnet today, the code is open, and the repo has the demo script, the architecture and the tests.

"If you hold a stock token pool, Corvex turns the weekend from a risk into revenue. Thank you."

---

## If someone asks

**What stops a bot splitting its trades into many small ones?** The band is measured from the last reference price, not per trade. A thousand small buys move the price as far as one big one, so the band stops them at the same place. After that, trades queue and clear at the same price as everyone else. One weakness I know about: there is no minimum queued order size and the queue holds 50 orders, so someone could spam it at the band edge. A minimum size and a per-account cap are the fix.

**Why did LPs get nothing in one test?** That cross had more sells than buys while the reference was above the pool, so the pool leg would have gone past the cross price. The contract skips it on purpose. Buyers and sellers matched directly, and the auction handles the rest. LPs get a surplus when the net goes through the pool in the direction of the gap.

**Why Uniswap v4?** The hook can take a trade out of a swap and hold it as a claim, set the fee per swap, and donate to LPs. None of that is possible without hooks.

**What is real and what is mock?** The v4 pool, the hook, CCIP, the CRE workflow and every transaction are real, on testnets. The tokens, the price feed and the market-status keeper are mocks, because Robinhood's testnet has no v4 and no stock-token pools. In production the status would come from a Chainlink Data Streams adapter.

**What is not built?** The replay of the real June 26 weekend (it needs a mainnet RPC), a CCIP lane for the mock USDG so cross-chain fills only come back on the local chain, and the queue order-size limit.

## Numbers to remember

- 97.6% of SPY's long-run gain arrives between the close and the open (quoted, not recomputed).
- 2% band while dark. 5% starting auction fee that falls every block. Normal fee 0.3%.
- Replay, weekend flow then a 6% gap: no hook **-115.75**, Corvex **0**.
- Replay, 6% gap with no queued orders: no hook **-157.47**, fee-only **-48.25**, Corvex **-2.93**.
- Testnet session 1: a 5,000 USDG buy paid LPs **1.2881 TSLA**.
- Tests: **104** contract tests, **13** CRE tests, **5** browser tests.
- CCIP from Robinhood Chain takes about **15 to 30 minutes**.

## If something goes wrong

- **Swaps fail with 0x90bfb865:** you closed the market during an auction, so the pool is far from the dark reference. Press Reopen market at the pool price (212) and start again.
- **The pool isn't dark:** press Close market again.
- **It is stuck in Auction:** one small buy returns it to Normal.
- **Fresh feed is red:** press Reopen market at 212.
- **A transaction is slow:** keep talking with the "if it is slow" lines above.
- **A print hasn't arrived:** show an earlier one that is Delivered, or the CCIP explorer.
