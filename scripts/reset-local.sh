#!/usr/bin/env bash
# Restarts a local anvil chain, deploys Corvex to it and syncs ABIs and addresses into the web app.
# Needs Foundry on PATH (forge, anvil).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
pkill -f "anvil" >/dev/null 2>&1 || taskkill //F //IM anvil.exe >/dev/null 2>&1 || true
sleep 1
(anvil --silent >/tmp/corvex-anvil.log 2>&1 &)
for _ in $(seq 1 20); do
  curl -s -X POST -H 'content-type: application/json' --data '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}' http://127.0.0.1:8545 >/dev/null 2>&1 && break
  sleep 0.5
done
cd "$ROOT/contracts"
# Foundry auto-loads contracts/.env; keep the local deploy on the anvil test key, never the testnet one.
export PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
forge script script/DeployLocal.s.sol --rpc-url http://127.0.0.1:8545 --broadcast --slow >/tmp/corvex-deploy.log 2>&1 || { tail -20 /tmp/corvex-deploy.log; exit 1; }
cd "$ROOT/web" && node scripts/sync-contracts.mjs
echo "local chain ready"
