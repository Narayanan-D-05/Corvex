// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {CorvexBase} from "./CorvexBase.sol";
import {CorvexLens} from "../src/CorvexLens.sol";
import {ReopenCrossHook} from "../src/ReopenCrossHook.sol";

contract LensTest is CorvexBase {
    CorvexLens lens;

    function setUp() public override {
        super.setUp();
        lens = new CorvexLens(manager);
    }

    function test_snapshotNormal() public view {
        CorvexLens.Snapshot memory s = lens.snapshot(hook, key);
        assertEq(uint8(s.mode), uint8(ReopenCrossHook.Mode.Normal));
        assertTrue(s.marketOpen);
        assertTrue(s.feedFresh);
        assertTrue(s.multiplierOk);
        assertTrue(s.plausible);
        assertApproxEqRel(s.poolPrice, 200e18, 1e12);
        assertEq(s.refPrice, 200e18);
        assertGt(s.liquidity, 0);
    }

    function test_snapshotShowsEachReopenLight() public {
        _closeMarket();
        _swapIn(alice, true, _q(10_000), 0);
        vm.prank(receiver);
        hook.applySchedule(pid, uint40(T0 + 1), uint40(T0 + 3 days), 2e18);

        vm.warp(T0 + 3 days);
        market.setOpen(true);
        stock.setOraclePaused(true);
        feed.setAnswer(106e8);
        CorvexLens.Snapshot memory s = lens.snapshot(hook, key);
        assertTrue(s.marketOpen);
        assertTrue(s.oraclePaused);
        assertTrue(s.feedFresh);
        assertFalse(s.multiplierOk, "split pending");
        assertFalse(s.plausible, "47% drop");
        assertEq(s.openOrders, 1);
        assertEq(s.expectedMultiplier, 2e18);

        stock.setOraclePaused(false);
        stock.setUiMultiplier(2e18);
        feed.setAnswer(212e8);
        s = lens.snapshot(hook, key);
        assertTrue(s.multiplierOk);
        assertTrue(s.plausible);
        assertFalse(s.oraclePaused);
    }
}
