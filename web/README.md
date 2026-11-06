# Corvex web

Landing page, app console, replay and docs. Next.js, viem, React Three Fiber, GSAP.

```bash
npm install
npm run sync      # copies ABIs and local deployment addresses from ../contracts
npm run dev
```

The console reads a deployment from `public/deployments/<name>.json`. `NEXT_PUBLIC_DEPLOYMENT` selects it (default `local`) and `NEXT_PUBLIC_RPC_URL` sets the RPC (default `http://127.0.0.1:8545`).

**Live testnet mode.** Copy the values from [.env.live.example](.env.live.example) into the build environment (`NEXT_PUBLIC_DEPLOYMENT=robinhood-testnet`). The console then reads the deployed contracts on Robinhood Chain Testnet, the oracles on Arbitrum and Base Sepolia, switches a connected wallet to the right network, and replaces the local demo controls with a token faucet, a public "Run the cross" button and the transactions of a weekend that already ran. The testnet deployment files in `public/deployments` are public addresses and are committed.

## Tests

```bash
bash ../scripts/reset-local.sh   # fresh local chain with Corvex deployed
npm run build
npm run test:e2e
```

The console test walks a full weekend through the UI, so it needs a fresh chain each run.
