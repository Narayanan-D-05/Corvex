// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {CorvexBase} from "./CorvexBase.sol";
import {ReopenCrossHook} from "../src/ReopenCrossHook.sol";
import {PriceMath} from "../src/libraries/PriceMath.sol";
import {SessionPrint, KIND_CLOSE, KIND_OPEN} from "../src/types/SessionPrint.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {Vm} from "forge-std/Vm.sol";

contract CrossTest is CorvexBase {
    struct CrossLog {
        uint256 price;
        uint256 volume;
        uint32 orders;
        uint256 donated0;
        uint256 donated1;
    }

    function _darkWithPrdQueue() internal {
        _closeMarket();
        _swapIn(alice, true, _q(5000), 215e18); // buys with a limit above p*
        _swapIn(bob, true, _q(8000), 220e18);
        _swapIn(carol, true, _q(5000), 205e18); // limit below p*: refunded
        _swapIn(dave, false, _u(30), 190e18); // sells
        assertEq(hook.getOrders(pid, 1).length, 4, "all four queued");
    }

    function _cross(uint256 ts, int256 answer) internal returns (CrossLog memory c) {
        _openMarketAt(ts, answer);
        vm.recordLogs();
        hook.executeCross(key);
        Vm.Log[] memory logs = vm.getRecordedLogs();
        bytes32 sig = ReopenCrossHook.CrossExecuted.selector;
        for (uint256 i; i < logs.length; ++i) {
            if (logs[i].topics[0] == sig) {
                (c.price, c.volume, c.orders, c.donated0, c.donated1) =
                    abi.decode(logs[i].data, (uint256, uint256, uint32, uint256, uint256));
            }
        }
    }

    function _users() internal view returns (address[6] memory) {
        return [alice, bob, carol, dave, arb, address(this)];
    }

    /// @dev claims held by the hook cover every credit and open order, with no more than dust left over.
    function _assertSolvent() internal view {
        address[2] memory cur = [address(stock), address(usdg)];
        for (uint256 c; c < 2; ++c) {
            uint256 sum;
            for (uint256 i; i < 6; ++i) sum += hook.credits(_users()[i], cur[c]);
            assertEq(sum, hook.liabilities(cur[c]), "credits == liabilities");
            uint256 bal = manager.balanceOf(address(hook), Currency.wrap(cur[c]).toId());
            assertGe(bal, hook.liabilities(cur[c]), "claims cover liabilities");
        }
    }

    function _withdrawAll() internal {
        address[2] memory cur = [address(stock), address(usdg)];
        for (uint256 i; i < 6; ++i) {
            address u = _users()[i];
            for (uint256 c; c < 2; ++c) {
                if (hook.credits(u, cur[c]) != 0) {
                    vm.prank(u);
                    hook.withdraw(Currency.wrap(cur[c]), u);
                }
            }
        }
    }

    // ---- the PRD scenario -----------------------------------------------------------------------

    function test_crossClearsQueueAtReopenPrice() public {
        _darkWithPrdQueue();
        CrossLog memory c = _cross(T0 + 3 days, 212e8);

        // the leg stops at p*, so the auction may end at once
        assertTrue(_mode() == ReopenCrossHook.Mode.Auction || _mode() == ReopenCrossHook.Mode.Normal);
        assertEq(c.price, 212e18);
        assertEq(c.orders, 3, "alice, bob and dave fill");

        // Carol's limit is below p*: full refund, no fill.
        assertEq(_credit(carol, false), _q(5000));
        assertEq(_credit(carol, true), 0);

        // Dave sold 30 STOCK at p*.
        assertEq(_credit(dave, false), _q(30 * 212));
        assertEq(_credit(dave, true), 0);

        // Buyers received stock, and paid at most their input.
        assertGt(_credit(alice, true), 0);
        assertGt(_credit(bob, true), 0);

        // The pool ended at p*, and LPs were paid the leftover.
        assertApproxEqAbs(_price(), 212e18, 212e18 / 10_000, "pool at p*");
        assertGt(c.donated0 + c.donated1, 0, "surplus donated");

        SessionPrint memory open = hook.getPrint(pid, 1, KIND_OPEN);
        assertEq(open.tokenPrice, 212e18);
        assertEq(open.orderCount, 3);
        assertGt(open.crossVolume, 0);

        _assertSolvent();
    }

    function test_everyoneCanWithdrawAfterCross() public {
        _darkWithPrdQueue();
        _cross(T0 + 3 days, 212e8);
        uint256 stockBefore = _balance(address(stock), alice);
        _withdrawAll();
        assertGt(_balance(address(stock), alice), stockBefore);
        assertEq(hook.liabilities(address(stock)), 0);
        assertEq(hook.liabilities(address(usdg)), 0);
    }

    function test_buyersNeverPayMoreThanInput() public {
        _darkWithPrdQueue();
        uint256 aStock0 = _balance(address(stock), alice);
        uint256 aUsdg0 = _balance(address(usdg), alice); // after the order input left
        _cross(T0 + 3 days, 212e8);
        _withdrawAll();
        uint256 spent = _q(5000) - (_balance(address(usdg), alice) - aUsdg0);
        uint256 got = _balance(address(stock), alice) - aStock0;
        // uniform price: every stock unit cost 212 (within rounding)
        assertApproxEqRel(spent, PriceMath.toQuote(scale, got, 212e18), 1e12);
    }

    function test_netSellImbalanceGapUp() public {
        _closeMarket();
        _swapIn(alice, true, _q(5000), 0);
        _swapIn(dave, false, _u(60), 0); // 12,720 of sells at p*, only 5,000 of buys
        _cross(T0 + 3 days, 212e8);
        // gap-up: the pool is below p*, so the surplus sells fill only against the buyer
        assertApproxEqAbs(_credit(alice, true), PriceMath.toStock(scale, _q(5000), 212e18), 1e6);
        assertApproxEqRel(_credit(dave, false), _q(5000), 1e12);
        assertApproxEqRel(_credit(dave, true), _u(60) - PriceMath.toStock(scale, _q(5000), 212e18), 1e12);
        _assertSolvent();
    }

    function test_gapDownMirrorsGapUp() public {
        _closeMarket();
        _swapIn(alice, true, _q(5000), 0);
        _swapIn(dave, false, _u(60), 0);
        CrossLog memory c = _cross(T0 + 3 days, 190e8);
        assertEq(c.price, 190e18);
        // gap-down: pool is above p*, the sellers' leftover stock trades into it up to p*
        assertApproxEqAbs(_price(), 190e18, 190e18 / 10_000);
        assertGt(c.donated0 + c.donated1, 0);
        _assertSolvent();
    }

    function test_crossWithOnlyBuysAndPoolAbovePrice() public {
        _closeMarket();
        _swapIn(alice, true, _q(5000), 0);
        _cross(T0 + 3 days, 190e8); // pool 200 is above p* 190: buyers can't be served below the pool
        // nothing trades against a pool that is worse than p*; buyers are scaled to what was matched (nothing)
        assertEq(_credit(alice, true), 0);
        assertEq(_credit(alice, false), _q(5000));
        _assertSolvent();
    }

    // ---- split trap (PRD test 6) ---------------------------------------------------------------

    function test_splitMismatchWaitsForUnpauseAndMultiplier() public {
        _closeMarket();
        _swapIn(alice, true, _q(10_000), 215e18);
        vm.prank(receiver);
        hook.applySchedule(pid, uint40(T0 + 1), uint40(T0 + 3 days), 2e18);

        // Monday 13:30: market open, the token oracle still paused.
        vm.warp(T0 + 3 days);
        market.setOpen(true);
        stock.setOraclePaused(true);
        feed.setAnswer(106e8);
        vm.expectRevert(ReopenCrossHook.OraclePaused.selector);
        hook.executeCross(key);

        // Unpaused, multiplier still 1.0, and the feed prints the per-share price.
        stock.setOraclePaused(false);
        vm.expectRevert(ReopenCrossHook.MultiplierNotUpdated.selector);
        hook.executeCross(key);
        // Nothing may fill at the wrong price in the meantime.
        hook.poke(key);
        assertEq(uint8(_mode()), uint8(ReopenCrossHook.Mode.AwaitingReopen));
        vm.expectRevert();
        _swapIn(bob, true, _q(100), 0);

        // Multiplier updated but the feed has not caught up: the 47% drop is rejected.
        stock.setUiMultiplier(2e18);
        vm.expectRevert(ReopenCrossHook.ImplausibleJump.selector);
        hook.executeCross(key);

        feed.setAnswer(212e8); // token price after the split
        hook.executeCross(key);

        SessionPrint memory open = hook.getPrint(pid, 1, KIND_OPEN);
        assertEq(open.tokenPrice, 212e18, "continuous, no fake 50% drop");
        assertEq(open.multiplier, 2e18);
        assertEq(hook.getState(pid).expectedMultiplier, 0, "schedule consumed");
        _assertSolvent();
    }

    function test_unscheduledSplitStillBlockedByPlausibility() public {
        _closeMarket();
        vm.warp(T0 + 3 days);
        market.setOpen(true);
        stock.setUiMultiplier(2e18);
        feed.setAnswer(106e8);
        vm.expectRevert(ReopenCrossHook.ImplausibleJump.selector);
        hook.executeCross(key);
    }

    function test_reopenChecksSeparateReasons() public {
        _closeMarket();
        vm.warp(T0 + 3 days);
        vm.expectRevert(ReopenCrossHook.MarketClosed.selector);
        hook.executeCross(key);
        market.setOpen(true);
        vm.expectRevert(ReopenCrossHook.StaleFeed.selector);
        hook.executeCross(key);
    }

    // ---- the leftover gap auction ---------------------------------------------------------------

    function test_auctionFeeDecaysOnlyTowardCrossPrice() public {
        _closeMarket();
        _cross(T0 + 3 days, 212e8); // empty queue: the pool is still at 200
        assertEq(uint8(_mode()), uint8(ReopenCrossHook.Mode.Auction));

        // Buying moves the price toward p*: expensive now, cheap after the fee has decayed.
        uint256 snap = vm.snapshotState();
        uint256 s0 = _balance(address(stock), arb);
        _swapIn(arb, true, _q(100), 0);
        uint256 gotEarly = _balance(address(stock), arb) - s0;
        vm.revertToState(snap);

        vm.roll(block.number + 18); // 50,000 - 18 * 2,500 = 5,000 pips
        uint256 s1 = _balance(address(stock), arb);
        _swapIn(arb, true, _q(100), 0);
        uint256 gotLate = _balance(address(stock), arb) - s1;
        assertGt(gotLate, gotEarly, "fee decayed");

        // Selling moves the price away from p*: always the normal fee.
        vm.revertToState(snap);
        uint256 q0 = _balance(address(usdg), arb);
        _swapIn(arb, false, _u(1), 0);
        uint256 gotSellEarly = _balance(address(usdg), arb) - q0;
        vm.revertToState(snap);
        vm.roll(block.number + 18);
        q0 = _balance(address(usdg), arb);
        _swapIn(arb, false, _u(1), 0);
        assertEq(_balance(address(usdg), arb) - q0, gotSellEarly, "sells pay the normal fee throughout");
    }

    function test_auctionEndsWhenPriceBackNearCross() public {
        _closeMarket();
        _cross(T0 + 3 days, 212e8);
        vm.roll(block.number + 20);
        _swapIn(arb, true, _q(8000), 0); // arbitrage closes the gap
        hook.poke(key);
        assertEq(uint8(_mode()), uint8(ReopenCrossHook.Mode.Normal));
    }

    function test_auctionEndsWhenFeeHasDecayedToNormal() public {
        _closeMarket();
        _cross(T0 + 3 days, 212e8);
        vm.roll(block.number + 19); // 19 * 2,500 = 47,500 pips = start - normal
        vm.warp(block.timestamp + 10);
        feed.setAnswer(212e8);
        hook.poke(key);
        assertEq(uint8(_mode()), uint8(ReopenCrossHook.Mode.Normal));
    }

    // ---- fuzz: settlement stays solvent ---------------------------------------------------------

    function testFuzz_crossIsSolventForAnyQueue(uint256 seed, uint8 count, int16 moveBps) public {
        count = uint8(bound(count, 1, 30));
        int256 move = bound(int256(moveBps), -1500, 1500);
        _closeMarket();

        address[4] memory who = [alice, bob, carol, dave];
        for (uint256 i; i < count; ++i) {
            uint256 r = uint256(keccak256(abi.encode(seed, i)));
            address u = who[r % 4];
            bool buy = (r >> 8) % 2 == 0;
            uint256 limit = (190 + ((r >> 16) % 41)) * 1e18; // 190..230
            if (buy) _swapIn(u, true, _q(4000 + ((r >> 32) % 36_000)), limit);
            else _swapIn(u, false, _u(15 + ((r >> 32) % 135)), limit);
        }

        int256 answer = int256(200e8) + (int256(200e8) * move) / 10_000;
        _openMarketAt(T0 + 3 days, answer);
        hook.executeCross(key);

        _assertSolvent();
        _withdrawAll();
        assertLe(hook.liabilities(address(stock)), 0);
        assertLe(hook.liabilities(address(usdg)), 0);
    }
}

contract CrossStockIs1Test is CrossTest {
    function _stockIs0() internal pure override returns (bool) {
        return false;
    }
}

contract CrossSixDecimalQuoteTest is CrossTest {
    function _decimals() internal pure override returns (uint8, uint8) {
        return (18, 6);
    }
}

contract CrossSixDecimalStockIs1Test is CrossTest {
    function _decimals() internal pure override returns (uint8, uint8) {
        return (18, 6);
    }

    function _stockIs0() internal pure override returns (bool) {
        return false;
    }
}
