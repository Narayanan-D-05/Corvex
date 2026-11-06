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
import {SessionPrintOracle} from "../src/ccip/SessionPrintOracle.sol";
import {OrderGateway} from "../src/ccip/OrderGateway.sol";
import {ReopenReceiver} from "../src/ccip/ReopenReceiver.sol";
import {SessionLedger} from "../src/consumers/SessionLedger.sol";
import {SessionPrint, KIND_CLOSE, KIND_OPEN} from "../src/types/SessionPrint.sol";

/// @notice Plays one weekend through the local deployment: close, queue (local and cross-chain), reopen, cross,
/// attest, book. Uses the well-known anvil test keys, so it only runs against a local chain.
contract LocalScenario is Script {
    using PoolIdLibrary for PoolKey;

    // anvil accounts 0..3
    uint256 constant PK_OWNER = 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80;
    uint256 constant PK_ALICE = 0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d;
    uint256 constant PK_BOB = 0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a;
    uint256 constant PK_DAVE = 0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6;

    uint64 constant ARB = 3478487238524512106;
    uint64 constant BASE = 10344971235874465080;

    struct Ctx {
        ReopenCrossHook hook;
        CorvexLens lens;
        MarketStatus market;
        MockStockToken stock;
        MockStockToken usdg;
        MockAggregator feed;
        PoolSwapTest swapRouter;
        SessionPrintOracle oracleArb;
        SessionLedger ledger;
        OrderGateway gateway;
        ReopenReceiver receiver;
        PoolKey key;
        bool stockIs0;
    }

    function run() external {
        Ctx memory c = _load();
        address alice = vm.addr(PK_ALICE);
        address bob = vm.addr(PK_BOB);
        address dave = vm.addr(PK_DAVE);

        _fund(c, alice, bob, dave);

        console2.log("1. market closes, hook goes dark");
        vm.startBroadcast(PK_OWNER);
        c.market.setOpen(false);
        c.hook.poke(c.key);
        vm.stopBroadcast();
        _log(c);

        console2.log("2. weekend orders queue instead of trading");
        _swap(c, PK_ALICE, true, 5000e6, 215e18);
        _swap(c, PK_BOB, true, 8000e6, 220e18);
        _swap(c, PK_DAVE, false, 30e18, 190e18);

        console2.log("3. a cross-chain buy arrives over CCIP (Base -> Robinhood)");
        vm.startBroadcast(PK_ALICE);
        c.usdg.approve(address(c.gateway), type(uint256).max);
        uint256 fee = c.gateway.quote(PoolId.unwrap(c.key.toId()), bob, address(c.usdg), 3000e6, 218e18);
        c.gateway.placeOrder{value: fee}(PoolId.unwrap(c.key.toId()), bob, address(c.usdg), 3000e6, 218e18);
        vm.stopBroadcast();
        _log(c);

        console2.log("4. market reopens at 212 (+6%), anyone runs the cross");
        vm.startBroadcast(PK_OWNER);
        c.market.setOpen(true);
        c.feed.setAnswer(212e8);
        c.hook.executeCross(c.key);
        vm.stopBroadcast();
        _log(c);

        console2.log("5. CRE attests both prints on the Arbitrum-side oracle");
        vm.startBroadcast(PK_OWNER);
        _judge(c, 0, KIND_CLOSE);
        _judge(c, 1, KIND_OPEN);
        int256 move = c.ledger.bookOvernight(address(c.stock), 1);
        vm.stopBroadcast();
        console2.log("   overnight booked (token terms, 18dp):", uint256(move));

        console2.log("6. fills are withdrawn");
        _withdrawAll(c, PK_ALICE);
        _withdrawAll(c, PK_BOB);
        _withdrawAll(c, PK_DAVE);

        console2.log("7. the cross-chain fill is sent back to its source chain");
        address vault = c.receiver.vaultOf(BASE, vm.addr(PK_BOB));
        uint256 owed = c.hook.credits(vault, address(c.stock));
        vm.startBroadcast(PK_OWNER);
        c.receiver.deliver{value: 0.01 ether}(vault, address(c.stock));
        vm.stopBroadcast();
        console2.log("   stock delivered to the user on the source chain:", owed);

        SessionPrint memory open = c.hook.getPrint(c.key.toId(), 1, KIND_OPEN);
        console2.log("open print price", open.tokenPrice);
        console2.log("open print orders", open.orderCount);
        console2.log("open print volume", open.crossVolume);
    }

    function _load() internal view returns (Ctx memory c) {
        string memory j = vm.readFile("./deployments/local.json");
        c.hook = ReopenCrossHook(vm.parseJsonAddress(j, ".hook"));
        c.lens = CorvexLens(vm.parseJsonAddress(j, ".lens"));
        c.market = MarketStatus(vm.parseJsonAddress(j, ".marketStatus"));
        c.stock = MockStockToken(vm.parseJsonAddress(j, ".stockToken"));
        c.usdg = MockStockToken(vm.parseJsonAddress(j, ".quoteToken"));
        c.feed = MockAggregator(vm.parseJsonAddress(j, ".feed"));
        c.swapRouter = PoolSwapTest(vm.parseJsonAddress(j, ".swapRouter"));
        c.oracleArb = SessionPrintOracle(vm.parseJsonAddress(j, ".oracleArb"));
        c.ledger = SessionLedger(vm.parseJsonAddress(j, ".ledger"));
        c.gateway = OrderGateway(vm.parseJsonAddress(j, ".gatewayBase"));
        c.receiver = ReopenReceiver(vm.parseJsonAddress(j, ".receiver"));
        c.key = PoolKey(
            Currency.wrap(vm.parseJsonAddress(j, ".currency0")),
            Currency.wrap(vm.parseJsonAddress(j, ".currency1")),
            LPFeeLibrary.DYNAMIC_FEE_FLAG,
            60,
            IHooks(address(c.hook))
        );
        c.stockIs0 = Currency.unwrap(c.key.currency0) == address(c.stock);
    }

    function _fund(Ctx memory c, address alice, address bob, address dave) internal {
        vm.startBroadcast(PK_OWNER);
        address[3] memory us = [alice, bob, dave];
        for (uint256 i; i < 3; ++i) {
            c.stock.mint(us[i], 1000e18);
            c.usdg.mint(us[i], 1_000_000e6);
        }
        vm.stopBroadcast();
        uint256[3] memory ks = [PK_ALICE, PK_BOB, PK_DAVE];
        for (uint256 i; i < 3; ++i) {
            vm.startBroadcast(ks[i]);
            c.stock.approve(address(c.swapRouter), type(uint256).max);
            c.usdg.approve(address(c.swapRouter), type(uint256).max);
            vm.stopBroadcast();
        }
    }

    function _swap(Ctx memory c, uint256 pk, bool buy, uint256 amountIn, uint256 limit) internal {
        bool zeroForOne = buy ? !c.stockIs0 : c.stockIs0;
        uint160 lim = zeroForOne ? TickMath.MIN_SQRT_PRICE + 1 : TickMath.MAX_SQRT_PRICE - 1;
        vm.startBroadcast(pk);
        c.swapRouter.swap(
            c.key,
            SwapParams(zeroForOne, -int256(amountIn), lim),
            PoolSwapTest.TestSettings({takeClaims: false, settleUsingBurn: false}),
            abi.encode(vm.addr(pk), limit)
        );
        vm.stopBroadcast();
    }

    function _judge(Ctx memory c, uint64 session, uint8 kind) internal {
        bytes32 k = c.oracleArb.keyOf(address(c.stock), session, kind);
        bytes memory md = abi.encodePacked(bytes32(uint256(1)), bytes10("corvex"), vm.addr(PK_OWNER), bytes2(0));
        c.oracleArb.onReport(md, abi.encode(k, true, int32(0), ARB));
    }

    function _withdrawAll(Ctx memory c, uint256 pk) internal {
        address u = vm.addr(pk);
        address[2] memory cur = [address(c.stock), address(c.usdg)];
        for (uint256 i; i < 2; ++i) {
            if (c.hook.credits(u, cur[i]) != 0) {
                vm.startBroadcast(pk);
                c.hook.withdraw(Currency.wrap(cur[i]), u);
                vm.stopBroadcast();
            }
        }
    }

    function _log(Ctx memory c) internal view {
        CorvexLens.Snapshot memory s = c.lens.snapshot(c.hook, c.key);
        console2.log("   mode", uint256(s.mode));
        console2.log("   pool price", s.poolPrice);
        console2.log("   open orders", s.openOrders);
    }
}
