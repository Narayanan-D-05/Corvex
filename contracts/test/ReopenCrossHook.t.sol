// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {CorvexBase} from "./CorvexBase.sol";
import {ReopenCrossHook} from "../src/ReopenCrossHook.sol";
import {SessionPrint, KIND_CLOSE, KIND_OPEN} from "../src/types/SessionPrint.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {StateLibrary} from "@uniswap/v4-core/src/libraries/StateLibrary.sol";
import {SwapParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";

contract ReopenCrossHookTest is CorvexBase {
    using StateLibrary for IPoolManager;

    function test_normalSwapExecutes() public {
        uint256 before = _balance(address(stock), alice);
        _swapIn(alice, true, _q(1000), 0);
        assertGt(_balance(address(stock), alice), before);
        assertEq(uint8(_mode()), uint8(ReopenCrossHook.Mode.Normal));
    }

    function test_marketCloseGoesDarkAndRecordsClosingPrint() public {
        _closeMarket();
        ReopenCrossHook.PoolState memory s = _state();
        assertEq(uint8(s.mode), uint8(ReopenCrossHook.Mode.Dark));
        assertEq(s.sessionId, 1);
        assertEq(s.darkRefPrice, 200e18);

        SessionPrint memory p = hook.getPrint(pid, 0, KIND_CLOSE);
        assertEq(p.tokenPrice, 200e18);
        assertEq(p.multiplier, 1e18);
        assertEq(p.kind, KIND_CLOSE);
        assertEq(p.token, address(stock));
    }

    function test_darkInBandSwapExecutes() public {
        _closeMarket();
        uint256 before = _balance(address(stock), alice);
        _swapIn(alice, true, _q(500), 0);
        assertGt(_balance(address(stock), alice), before);
        assertEq(hook.getOrders(pid, 1).length, 0);
    }

    function test_darkOutOfBandSwapQueues() public {
        _closeMarket();
        uint256 priceBefore = _price();
        uint256 usdgBefore = _balance(address(usdg), alice);
        uint256 stockBefore = _balance(address(stock), alice);
        _swapIn(alice, true, _q(10_000), 215e18);

        assertEq(usdgBefore - _balance(address(usdg), alice), _q(10_000), "input taken");
        assertEq(_balance(address(stock), alice), stockBefore, "no fill yet");
        assertEq(_price(), priceBefore, "pool untouched");
        ReopenCrossHook.Order[] memory o = hook.getOrders(pid, 1);
        assertEq(o.length, 1);
        assertEq(o[0].owner, alice);
        assertTrue(o[0].buy);
        assertEq(o[0].amountIn, _q(10_000));
        assertEq(o[0].limitPrice, 215e18);
        assertEq(hook.liabilities(address(usdg)), _q(10_000));
        assertEq(manager.balanceOf(address(hook), Currency.wrap(address(usdg)).toId()), _q(10_000));
    }

    function test_exactOutputOutOfBandReverts() public {
        _closeMarket();
        bool zeroForOne = !scale.stockIs0; // buy stock
        uint160 lim = zeroForOne ? TickMath.MIN_SQRT_PRICE + 1 : TickMath.MAX_SQRT_PRICE - 1;
        vm.expectRevert();
        vm.prank(alice);
        swapRouter.swap(
            key, SwapParams(zeroForOne, int256(_u(60)), lim), _settings(), abi.encode(alice, uint256(0))
        );
    }

    function test_queueCapReverts() public {
        _closeMarket();
        for (uint256 i; i < 50; ++i) _swapIn(alice, true, _q(5000), 0);
        assertEq(hook.openCount(pid, 1), 50);
        vm.expectRevert();
        _swapIn(alice, true, _q(5000), 0);
    }

    function test_cancelRefundsFully() public {
        _closeMarket();
        _swapIn(alice, true, _q(10_000), 0);
        vm.prank(alice);
        hook.cancel(key, 1, 0);
        assertEq(_credit(alice, false), _q(10_000));
        vm.prank(alice);
        hook.withdraw(Currency.wrap(address(usdg)), alice);
        assertEq(_balance(address(usdg), alice), _q(10_000_000));
        assertEq(hook.liabilities(address(usdg)), 0);
    }

    function test_cancelOnlyOwner() public {
        _closeMarket();
        _swapIn(alice, true, _q(10_000), 0);
        vm.prank(bob);
        vm.expectRevert(ReopenCrossHook.NotOwnerOrExpired.selector);
        hook.cancel(key, 1, 0);
    }

    function test_awaitingReopenBlocksSwaps() public {
        _closeMarket();
        _openMarketAt(T0 + 3 days, 200e8);
        hook.poke(key);
        assertEq(uint8(_mode()), uint8(ReopenCrossHook.Mode.AwaitingReopen));
        vm.expectRevert();
        _swapIn(alice, true, _q(100), 0);
    }

    function test_stalenessGoesDark() public {
        vm.warp(T0 + 2 hours);
        hook.poke(key);
        assertEq(uint8(_mode()), uint8(ReopenCrossHook.Mode.Dark));
    }

    function test_oraclePauseGoesDark() public {
        stock.setOraclePaused(true);
        hook.poke(key);
        assertEq(uint8(_mode()), uint8(ReopenCrossHook.Mode.Dark));
    }

    function test_scheduleEntersDarkEarlyButCannotExit() public {
        vm.prank(receiver);
        hook.applySchedule(pid, uint40(T0 + 1 hours), uint40(T0 + 3 days), 0);
        hook.poke(key);
        assertEq(uint8(_mode()), uint8(ReopenCrossHook.Mode.Normal));
        vm.warp(T0 + 90 minutes);
        feed.setAnswer(200e8);
        hook.poke(key);
        assertEq(uint8(_mode()), uint8(ReopenCrossHook.Mode.Dark));
        // everything else is green, and still no reopen before the window ends
        vm.expectRevert(ReopenCrossHook.ScheduleActive.selector);
        hook.executeCross(key);
    }

    function test_scheduleOnlyFromReceiver() public {
        vm.expectRevert(ReopenCrossHook.OnlyReceiver.selector);
        hook.applySchedule(pid, uint40(T0 + 1), uint40(T0 + 1 days), 0);
    }

    function test_missedCloseIsDetected() public {
        market.setOpen(false);
        market.setOpen(true); // closed and reopened with nobody poking
        feed.setAnswer(212e8);
        hook.poke(key);
        assertEq(uint8(_mode()), uint8(ReopenCrossHook.Mode.Dark));
        assertEq(hook.getPrint(pid, 0, KIND_CLOSE).tokenPrice, 200e18, "close uses last checked price");
    }

    function test_crossWithEmptyQueueRecordsFlaggedOpenPrint() public {
        _closeMarket();
        _openMarketAt(T0 + 3 days, 204e8);
        hook.executeCross(key);
        SessionPrint memory p = hook.getPrint(pid, 1, KIND_OPEN);
        assertEq(p.tokenPrice, 204e18);
        assertEq(p.crossVolume, 0);
        assertEq(p.orderCount, 0);
    }

    function test_crossRevertsOutsideReopen() public {
        vm.expectRevert(ReopenCrossHook.NotAwaiting.selector);
        hook.executeCross(key);
    }

    function test_timeoutMakesQueueRefundableByAnyone() public {
        _closeMarket();
        _swapIn(alice, true, _q(10_000), 0);
        _openMarketAt(T0 + 3 days, 100e8); // implausible: the cross can never pass
        hook.poke(key);
        vm.expectRevert(ReopenCrossHook.NotOwnerOrExpired.selector);
        vm.prank(bob);
        hook.cancel(key, 1, 0);

        vm.warp(T0 + 3 days + 25 hours);
        feed.setAnswer(100e8);
        assertTrue(_mode() == ReopenCrossHook.Mode.AwaitingReopen);
        vm.prank(bob);
        hook.cancel(key, 1, 0);
        assertEq(_credit(alice, false), _q(10_000));
    }
}
