// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console2} from "forge-std/Script.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {LPFeeLibrary} from "@uniswap/v4-core/src/libraries/LPFeeLibrary.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {SwapParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {PoolSwapTest} from "@uniswap/v4-core/src/test/PoolSwapTest.sol";

import {ReopenCrossHook} from "../src/ReopenCrossHook.sol";
import {CorvexLens} from "../src/CorvexLens.sol";
import {MarketStatus} from "../src/MarketStatus.sol";
import {MockStockToken} from "../src/mocks/MockStockToken.sol";
import {MockAggregator} from "../src/mocks/MockAggregator.sol";

/// @notice Plays one weekend on Robinhood Chain Testnet with the deployer key alone and as little gas as possible.
/// STAGE=close: market closes, hook goes dark, two orders queue. STAGE=open: market reopens at OPEN_PRICE_USD
/// (default 212), the cross runs and both prints are broadcast over CCIP. Re-runnable for the next weekend.
contract TestnetScenario is Script {
    using PoolIdLibrary for PoolKey;

    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address me = vm.addr(pk);
        string memory stage = vm.envString("STAGE");
        string memory j = vm.readFile("./deployments/robinhood-testnet.json");

        ReopenCrossHook hook = ReopenCrossHook(vm.parseJsonAddress(j, ".hook"));
        CorvexLens lens = CorvexLens(vm.parseJsonAddress(j, ".lens"));
        MarketStatus market = MarketStatus(vm.parseJsonAddress(j, ".marketStatus"));
        MockStockToken stock = MockStockToken(vm.parseJsonAddress(j, ".stockToken"));
        MockStockToken usdg = MockStockToken(vm.parseJsonAddress(j, ".quoteToken"));
        MockAggregator feed = MockAggregator(vm.parseJsonAddress(j, ".feed"));
        PoolSwapTest router = PoolSwapTest(vm.parseJsonAddress(j, ".swapRouter"));
        PoolKey memory key = PoolKey(
            Currency.wrap(vm.parseJsonAddress(j, ".currency0")),
            Currency.wrap(vm.parseJsonAddress(j, ".currency1")),
            LPFeeLibrary.DYNAMIC_FEE_FLAG,
            60,
            IHooks(address(hook))
        );
        bool stockIs0 = Currency.unwrap(key.currency0) == address(stock);

        vm.startBroadcast(pk);
        if (keccak256(bytes(stage)) == keccak256("close")) {
            stock.mint(me, 50e18);
            usdg.mint(me, 20_000e6);
            stock.approve(address(router), type(uint256).max);
            usdg.approve(address(router), type(uint256).max);
            feed.setAnswer(int256(vm.envOr("CLOSE_PRICE_USD", uint256(200))) * 1e8);
            market.setOpen(false);
            hook.poke(key);
            _log(lens, hook, key, "market closed");
            _swap(router, key, !stockIs0, 5000e6, 215e18, me);
            _swap(router, key, stockIs0, 10e18, 190e18, me);
            _log(lens, hook, key, "orders queued");
        } else {
            market.setOpen(true);
            feed.setAnswer(int256(vm.envOr("OPEN_PRICE_USD", uint256(212))) * 1e8);
            hook.executeCross(key);
            _log(lens, hook, key, "crossed");
        }
        vm.stopBroadcast();
    }

    function _swap(PoolSwapTest router, PoolKey memory key, bool zeroForOne, uint256 amountIn, uint256 limit, address me)
        internal
    {
        uint160 lim = zeroForOne ? TickMath.MIN_SQRT_PRICE + 1 : TickMath.MAX_SQRT_PRICE - 1;
        router.swap(
            key,
            SwapParams(zeroForOne, -int256(amountIn), lim),
            PoolSwapTest.TestSettings({takeClaims: false, settleUsingBurn: false}),
            abi.encode(me, limit)
        );
    }

    function _log(CorvexLens lens, ReopenCrossHook hook, PoolKey memory key, string memory what) internal view {
        CorvexLens.Snapshot memory s = lens.snapshot(hook, key);
        console2.log(what);
        console2.log("   mode", uint256(s.mode));
        console2.log("   pool price", s.poolPrice);
        console2.log("   open orders", s.openOrders);
    }
}
