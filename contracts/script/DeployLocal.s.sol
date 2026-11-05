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

import {ReopenCrossHook} from "../src/ReopenCrossHook.sol";
import {CorvexLens} from "../src/CorvexLens.sol";
import {MarketStatus} from "../src/MarketStatus.sol";
import {PriceMath} from "../src/libraries/PriceMath.sol";
import {MockStockToken} from "../src/mocks/MockStockToken.sol";
import {MockAggregator} from "../src/mocks/MockAggregator.sol";
import {MockCCIPRouter} from "../src/mocks/MockCCIPRouter.sol";
import {PrintBroadcaster} from "../src/ccip/PrintBroadcaster.sol";
import {SessionPrintOracle} from "../src/ccip/SessionPrintOracle.sol";
import {ReopenController} from "../src/ccip/ReopenController.sol";
import {ReopenReceiver} from "../src/ccip/ReopenReceiver.sol";
import {OrderGateway} from "../src/ccip/OrderGateway.sol";
import {SessionLedger} from "../src/consumers/SessionLedger.sol";
import {HookDeployer, CorvexHookMiner} from "./HookDeployer.sol";

/// @notice Deploys the whole system on one local chain (anvil) with a mock CCIP router, so the full workflow can be
/// exercised end to end. The deployer doubles as the CRE forwarder. Writes deployments/local.json.
contract DeployLocal is Script {
    using PoolIdLibrary for PoolKey;

    uint64 constant RH = 2032988798112970440;
    uint64 constant ARB = 3478487238524512106;
    uint64 constant BASE = 10344971235874465080;

    struct D {
        PoolManager pm;
        PoolModifyLiquidityTest lp;
        PoolSwapTest swapRouter;
        MockStockToken stock;
        MockStockToken usdg;
        MockAggregator feed;
        MarketStatus market;
        ReopenCrossHook hook;
        MockCCIPRouter router;
        PrintBroadcaster broadcaster;
        SessionPrintOracle oracleArb;
        SessionPrintOracle oracleBase;
        ReopenController controller;
        ReopenReceiver receiver;
        OrderGateway gatewayBase;
        SessionLedger ledger;
        CorvexLens lens;
        PoolKey key;
    }

    function run() external {
        uint256 pk = vm.envOr("PRIVATE_KEY", uint256(0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80));
        address me = vm.addr(pk);
        D memory d;

        vm.startBroadcast(pk);

        d.pm = new PoolManager(me);
        d.lp = new PoolModifyLiquidityTest(IPoolManager(address(d.pm)));
        d.swapRouter = new PoolSwapTest(IPoolManager(address(d.pm)));

        d.stock = new MockStockToken("Tesla Stock Token", "TSLA", 18);
        d.usdg = new MockStockToken("Global Dollar", "USDG", 6);
        d.feed = new MockAggregator(8, 200e8);
        d.market = new MarketStatus(me, true);

        // hook at a mined address
        HookDeployer factory = new HookDeployer();
        (address predicted, bytes32 salt, bytes memory initCode) =
            CorvexHookMiner.mine(address(factory), IPoolManager(address(d.pm)), me);
        d.hook = ReopenCrossHook(factory.deploy(salt, initCode));
        require(address(d.hook) == predicted, "hook address mismatch");

        // CCIP side (one router plays every chain)
        d.router = new MockCCIPRouter();
        d.router.setSupported(RH, true);
        d.router.setSupported(ARB, true);
        d.router.setSupported(BASE, true);

        d.broadcaster = new PrintBroadcaster(address(d.router), address(d.hook), me);
        d.router.setHome(address(d.broadcaster), RH);
        d.oracleArb = new SessionPrintOracle(address(d.router), me, RH, address(d.broadcaster), ARB, me);
        d.oracleBase = new SessionPrintOracle(address(d.router), me, RH, address(d.broadcaster), BASE, me);
        d.broadcaster.addDestination(ARB, address(d.oracleArb), 300_000);
        d.broadcaster.addDestination(BASE, address(d.oracleBase), 300_000);
        payable(address(d.broadcaster)).transfer(5 ether);
        d.hook.setBroadcaster(address(d.broadcaster));

        d.receiver = new ReopenReceiver(address(d.router), address(d.hook), me);
        d.router.setHome(address(d.receiver), RH);
        d.hook.setReceiver(address(d.receiver));

        d.controller = new ReopenController(address(d.router), me, ARB, RH, me);
        d.controller.setReopenReceiver(address(d.receiver));
        d.router.setHome(address(d.controller), ARB);
        payable(address(d.controller)).transfer(5 ether);
        d.receiver.setScheduleSender(ARB, address(d.controller));

        d.gatewayBase = new OrderGateway(address(d.router), RH, me);
        d.gatewayBase.setReopenReceiver(address(d.receiver));
        d.router.setHome(address(d.gatewayBase), BASE);
        d.receiver.setOrderGateway(BASE, address(d.gatewayBase));

        d.ledger = new SessionLedger(d.oracleArb);
        d.lens = new CorvexLens(IPoolManager(address(d.pm)));

        // pool: 1,000 TSLA against 200,000 USDG at $200
        (Currency c0, Currency c1) = address(d.stock) < address(d.usdg)
            ? (Currency.wrap(address(d.stock)), Currency.wrap(address(d.usdg)))
            : (Currency.wrap(address(d.usdg)), Currency.wrap(address(d.stock)));
        d.key = PoolKey(c0, c1, LPFeeLibrary.DYNAMIC_FEE_FLAG, 60, IHooks(address(d.hook)));
        d.hook.configure(
            d.key,
            ReopenCrossHook.Config({
                stockToken: address(d.stock),
                feed: address(d.feed),
                marketStatus: address(d.market),
                maxStaleness: 1 hours,
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
        PriceMath.Scale memory sc = PriceMath.Scale({
            stockIs0: Currency.unwrap(c0) == address(d.stock),
            stockUnit: 1e18,
            quoteUnit: 1e6
        });
        d.pm.initialize(d.key, PriceMath.sqrtFromPrice(sc, 200e18));
        d.receiver.registerPool(d.key);

        d.stock.mint(me, 1_000_000e18);
        d.usdg.mint(me, 100_000_000e6);
        d.stock.approve(address(d.lp), type(uint256).max);
        d.usdg.approve(address(d.lp), type(uint256).max);
        d.lp.modifyLiquidity(d.key, ModifyLiquidityParams(-887_220, 887_220, int256(_sqrt(1000e18 * 200_000e6)), 0), "");

        vm.stopBroadcast();

        _write(d);
        console2.log("hook", address(d.hook));
        console2.logBytes32(PoolId.unwrap(d.key.toId()));
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
        string memory o = "d";
        vm.serializeAddress(o, "poolManager", address(d.pm));
        vm.serializeAddress(o, "liquidityRouter", address(d.lp));
        vm.serializeAddress(o, "swapRouter", address(d.swapRouter));
        vm.serializeAddress(o, "stockToken", address(d.stock));
        vm.serializeAddress(o, "quoteToken", address(d.usdg));
        vm.serializeAddress(o, "feed", address(d.feed));
        vm.serializeAddress(o, "marketStatus", address(d.market));
        vm.serializeAddress(o, "hook", address(d.hook));
        vm.serializeAddress(o, "ccipRouter", address(d.router));
        vm.serializeAddress(o, "broadcaster", address(d.broadcaster));
        vm.serializeAddress(o, "oracleArb", address(d.oracleArb));
        vm.serializeAddress(o, "oracleBase", address(d.oracleBase));
        vm.serializeAddress(o, "controller", address(d.controller));
        vm.serializeAddress(o, "receiver", address(d.receiver));
        vm.serializeAddress(o, "gatewayBase", address(d.gatewayBase));
        vm.serializeAddress(o, "ledger", address(d.ledger));
        vm.serializeAddress(o, "lens", address(d.lens));
        vm.serializeBytes32(o, "poolId", PoolId.unwrap(d.key.toId()));
        vm.serializeAddress(o, "currency0", Currency.unwrap(d.key.currency0));
        string memory out = vm.serializeAddress(o, "currency1", Currency.unwrap(d.key.currency1));
        vm.writeJson(out, "./deployments/local.json");
    }
}
