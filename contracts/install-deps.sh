#!/usr/bin/env bash
# Clones Solidity dependencies into contracts/lib (ignored by git).
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p lib && cd lib
[ -d forge-std ] || git clone --depth 1 https://github.com/foundry-rs/forge-std.git forge-std
[ -d openzeppelin-uniswap-hooks ] || git clone --depth 1 --recurse-submodules https://github.com/OpenZeppelin/uniswap-hooks.git openzeppelin-uniswap-hooks
[ -d chainlink ] || git clone --depth 1 https://github.com/smartcontractkit/chainlink-brownie-contracts.git chainlink
[ -d chainlink-ccip ] || git clone --depth 1 https://github.com/smartcontractkit/chainlink-ccip.git chainlink-ccip
