// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console2} from "forge-std/Script.sol";
import {PoolManager} from "@uniswap/v4-core/src/PoolManager.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {LPFeeLibrary} from "@uniswap/v4-core/src/libraries/LPFeeLibrary.sol";
import {ModifyLiquidityParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {PoolModifyLiquidityTest} from "@uniswap/v4-core/src/test/PoolModifyLiquidityTest.sol";
import {PoolSwapTest} from "@uniswap/v4-core/src/test/PoolSwapTest.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

import {ReopenCrossHook} from "../src/ReopenCrossHook.sol";
import {CorvexLens} from "../src/CorvexLens.sol";
import {MarketStatus} from "../src/MarketStatus.sol";
import {PriceMath} from "../src/libraries/PriceMath.sol";
import {MockStockToken} from "../src/mocks/MockStockToken.sol";
import {MockAggregator} from "../src/mocks/MockAggregator.sol";
import {PrintBroadcaster} from "../src/ccip/PrintBroadcaster.sol";
import {ReopenReceiver} from "../src/ccip/ReopenReceiver.sol";
import {HookDeployer, CorvexHookMiner} from "./HookDeployer.sol";

/// @notice Robinhood Chain Testnet: the hook, its pool, the print broadcaster and the CCIP receiver.
///
/// Env: PRIVATE_KEY, RH_CCIP_ROUTER. Optional: POOL_MANAGER (deployed here if unset, since there is no v4 on the
/// testnet), STOCK_TOKEN, QUOTE_TOKEN, STOCK_FEED, MARKET_STATUS (mocks are deployed for any that are unset),
/// POOL_PRICE_USD (default 200), POOL_STOCK_LIQUIDITY (whole tokens, default 1000).
/// Writes deployments/robinhood-testnet.json.
contract DeployRobinhood is Script {
    using PoolIdLibrary for PoolKey;

    struct D {
        address pm;
        address lp;
        address swapRouter;
        address stock;
        address quote;
        address feed;
        address market;
        ReopenCrossHook hook;
        PrintBroadcaster broadcaster;
        ReopenReceiver receiver;
        CorvexLens lens;
        PoolKey key;
        bool minted;
    }

    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address me = vm.addr(pk);
        address ccipRouter = vm.envAddress("RH_CCIP_ROUTER");
        D memory d;

        vm.startBroadcast(pk);

        d.pm = vm.envOr("POOL_MANAGER", address(0));
        if (d.pm == address(0)) {
            d.pm = address(new PoolManager(me));
            console2.log("PoolManager deployed", d.pm);
        }
        d.lp = address(new PoolModifyLiquidityTest(IPoolManager(d.pm)));
        d.swapRouter = address(new PoolSwapTest(IPoolManager(d.pm)));

        d.stock = vm.envOr("STOCK_TOKEN", address(0));
        if (d.stock == address(0)) {
            d.stock = address(new MockStockToken("Tesla Stock Token", "TSLA", 18));
            d.minted = true;
        }
        d.quote = vm.envOr("QUOTE_TOKEN", address(0));
        if (d.quote == address(0)) {
            d.quote = address(new MockStockToken("Global Dollar", "USDG", 6));
            d.minted = true;
        }
        d.feed = vm.envOr("STOCK_FEED", address(0));
        if (d.feed == address(0)) d.feed = address(new MockAggregator(8, int256(vm.envOr("POOL_PRICE_USD", uint256(200))) * 1e8));
        d.market = vm.envOr("MARKET_STATUS", address(0));
        if (d.market == address(0)) d.market = address(new MarketStatus(me, true));

        HookDeployer factory = new HookDeployer();
        (address predicted, bytes32 salt, bytes memory initCode) =
            CorvexHookMiner.mine(address(factory), IPoolManager(d.pm), me);
        d.hook = ReopenCrossHook(factory.deploy(salt, initCode));
        require(address(d.hook) == predicted, "hook address mismatch");

        d.broadcaster = new PrintBroadcaster(ccipRouter, address(d.hook), me);
        d.hook.setBroadcaster(address(d.broadcaster));
        d.receiver = new ReopenReceiver(ccipRouter, address(d.hook), me);
        d.hook.setReceiver(address(d.receiver));
        d.lens = new CorvexLens(IPoolManager(d.pm));

        _createPool(d, me);
        d.receiver.registerPool(d.key);

        vm.stopBroadcast();
        _write(d);
        console2.log("hook", address(d.hook));
        console2.log("broadcaster", address(d.broadcaster));
        console2.log("receiver", address(d.receiver));
        console2.logBytes32(PoolId.unwrap(d.key.toId()));
    }

    function _createPool(D memory d, address me) internal {
        (Currency c0, Currency c1) = d.stock < d.quote
            ? (Currency.wrap(d.stock), Currency.wrap(d.quote))
            : (Currency.wrap(d.quote), Currency.wrap(d.stock));
        d.key = PoolKey(c0, c1, LPFeeLibrary.DYNAMIC_FEE_FLAG, 60, IHooks(address(d.hook)));
        d.hook.configure(
            d.key,
            ReopenCrossHook.Config({
                stockToken: d.stock,
                feed: d.feed,
                marketStatus: d.market,
                maxStaleness: uint32(vm.envOr("MAX_STALENESS", uint256(1 hours))),
                bandBps: 200,
                plausibilityBps: 2000,
                queueCap: 50,
                timeout: 24 hours,
                normalFee: 3000,
                auctionStartFee: 50_000,
                auctionDecayPerBlock: 2500,
                auctionExitBps: 50
            })
        );

        uint256 price = vm.envOr("POOL_PRICE_USD", uint256(200)) * 1e18;
        PriceMath.Scale memory sc = PriceMath.Scale({
            stockIs0: d.stock < d.quote,
            stockUnit: 10 ** IERC20Metadata(d.stock).decimals(),
            quoteUnit: 10 ** IERC20Metadata(d.quote).decimals()
        });
        IPoolManager(d.pm).initialize(d.key, PriceMath.sqrtFromPrice(sc, price));

        if (d.minted) {
            uint256 stockLiq = vm.envOr("POOL_STOCK_LIQUIDITY", uint256(1000)) * sc.stockUnit;
            uint256 quoteLiq = stockLiq * price / 1e18 * sc.quoteUnit / sc.stockUnit;
            MockStockToken(d.stock).mint(me, stockLiq * 2);
            MockStockToken(d.quote).mint(me, quoteLiq * 2);
            MockStockToken(d.stock).approve(d.lp, type(uint256).max);
            MockStockToken(d.quote).approve(d.lp, type(uint256).max);
            uint256 liq = _sqrt(stockLiq * quoteLiq);
            PoolModifyLiquidityTest(d.lp).modifyLiquidity(d.key, ModifyLiquidityParams(-887_220, 887_220, int256(liq), 0), "");
        }
    }

    function _sqrt(uint256 x) internal pure returns (uint256 r) {
        r = x;
        uint256 z = (x + 1) / 2;
        while (z < r) {
            r = z;
            z = (x / z + z) / 2;
        }
    }

    function _write(D memory d) internal {
        string memory o = "rh";
        vm.serializeAddress(o, "poolManager", d.pm);
        vm.serializeAddress(o, "liquidityRouter", d.lp);
        vm.serializeAddress(o, "swapRouter", d.swapRouter);
        vm.serializeAddress(o, "stockToken", d.stock);
        vm.serializeAddress(o, "quoteToken", d.quote);
        vm.serializeAddress(o, "feed", d.feed);
        vm.serializeAddress(o, "marketStatus", d.market);
        vm.serializeAddress(o, "hook", address(d.hook));
        vm.serializeAddress(o, "broadcaster", address(d.broadcaster));
        vm.serializeAddress(o, "receiver", address(d.receiver));
        vm.serializeAddress(o, "lens", address(d.lens));
        vm.serializeBytes32(o, "poolId", PoolId.unwrap(d.key.toId()));
        vm.serializeAddress(o, "currency0", Currency.unwrap(d.key.currency0));
        string memory out = vm.serializeAddress(o, "currency1", Currency.unwrap(d.key.currency1));
        vm.writeJson(out, "./deployments/robinhood-testnet.json");
    }
}
