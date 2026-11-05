// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {console2} from "forge-std/console2.sol";
import {CorvexBase} from "./CorvexBase.sol";
import {FeeOnlyHook} from "./helpers/FeeOnlyHook.sol";
import {ReopenCrossHook} from "../src/ReopenCrossHook.sol";
import {PriceMath} from "../src/libraries/PriceMath.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {LPFeeLibrary} from "@uniswap/v4-core/src/libraries/LPFeeLibrary.sol";
import {SwapParams, ModifyLiquidityParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {StateLibrary} from "@uniswap/v4-core/src/libraries/StateLibrary.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";

/// @notice The same weekend through three pools: no hook, a fee-only hook, and Corvex. LP loss is measured as the
/// value of the LP's position at the fair price after the weekend, against what the same inventory was worth
/// before it. These run on mocks; the fork replay of the real June 26 weekend needs a Robinhood mainnet RPC.
contract ReplayTest is CorvexBase {
    using PoolIdLibrary for PoolKey;
    using StateLibrary for IPoolManager;

    uint256 constant FAIR = 212e18;

    PoolKey keyA; // no hook
    PoolKey keyB; // fee-only hook
    FeeOnlyHook feeHook;
    uint256 depositStock;
    uint256 depositQuote;

    function setUp() public override {
        super.setUp();

        keyA = PoolKey(key.currency0, key.currency1, 3000, 60, IHooks(address(0)));
        manager.initialize(keyA, PriceMath.sqrtFromPrice(scale, 200e18));
        uint256 s0 = _balance(address(stock), address(this));
        uint256 q0 = _balance(address(usdg), address(this));
        modifyLiquidityRouter.modifyLiquidity(keyA, ModifyLiquidityParams(-887_220, 887_220, int256(_liquidity()), 0), "");
        depositStock = s0 - _balance(address(stock), address(this));
        depositQuote = q0 - _balance(address(usdg), address(this));

        address hb = address(uint160(uint160(Hooks.BEFORE_SWAP_FLAG)) ^ (0x5555 << 144));
        deployCodeTo("FeeOnlyHook.sol:FeeOnlyHook", abi.encode(address(manager), address(feed), scale), hb);
        feeHook = FeeOnlyHook(hb);
        keyB = PoolKey(key.currency0, key.currency1, LPFeeLibrary.DYNAMIC_FEE_FLAG, 60, IHooks(hb));
        manager.initialize(keyB, PriceMath.sqrtFromPrice(scale, 200e18));
        modifyLiquidityRouter.modifyLiquidity(keyB, ModifyLiquidityParams(-887_220, 887_220, int256(_liquidity()), 0), "");
    }

    // ---- helpers --------------------------------------------------------------------------------

    function _priceOf(PoolKey memory k) internal view returns (uint256) {
        (uint160 sqrtP,,,) = manager.getSlot0(k.toId());
        return PriceMath.priceFromSqrt(scale, sqrtP);
    }

    function _swapOn(PoolKey memory k, address who, bool buy, uint256 amountIn, uint160 limit, bytes memory data)
        internal
    {
        bool zeroForOne = buy ? !scale.stockIs0 : scale.stockIs0;
        vm.prank(who);
        swapRouter.swap(k, SwapParams(zeroForOne, -int256(amountIn), limit), _settings(), data);
    }

    /// @dev Trades the pool toward fair value until the fee makes further trades unprofitable.
    function _arb(PoolKey memory k, uint24 feePips) internal returns (bool traded) {
        uint256 price = _priceOf(k);
        uint256 lowT = FAIR * (1e6 - feePips) / 1e6;
        uint256 highT = FAIR * 1e6 / (1e6 - feePips);
        (uint160 cur,,,) = manager.getSlot0(k.toId());
        if (price < lowT) {
            uint160 lim = PriceMath.sqrtFromPrice(scale, lowT);
            bool zfo = !scale.stockIs0; // buying stock
            if (zfo ? lim >= cur : lim <= cur) return false; // inside rounding of the limit
            _swapOn(k, arb, true, _q(5_000_000), lim, "");
            traded = true;
        } else if (price > highT) {
            uint160 lim = PriceMath.sqrtFromPrice(scale, highT);
            bool zfo = scale.stockIs0; // selling stock
            if (zfo ? lim >= cur : lim <= cur) return false;
            _swapOn(k, arb, false, _u(5000), lim, "");
            traded = true;
        }
    }

    function _lpPnl(PoolKey memory k) internal returns (int256 pnl) {
        uint256 s0 = _balance(address(stock), address(this));
        uint256 q0 = _balance(address(usdg), address(this));
        modifyLiquidityRouter.modifyLiquidity(k, ModifyLiquidityParams(-887_220, 887_220, -int256(_liquidity()), 0), "");
        uint256 outStock = _balance(address(stock), address(this)) - s0;
        uint256 outQuote = _balance(address(usdg), address(this)) - q0;
        uint256 before = PriceMath.toQuote(scale, depositStock, FAIR) + depositQuote;
        uint256 afterV = PriceMath.toQuote(scale, outStock, FAIR) + outQuote;
        pnl = int256(afterV) - int256(before);
    }

    function _corvexFee() internal view returns (uint24) {
        ReopenCrossHook.PoolState memory s = _state();
        if (s.mode != ReopenCrossHook.Mode.Auction) return 3000;
        uint256 decayed = (block.number - s.auctionStartBlock) * 2500;
        uint256 f = decayed >= 50_000 ? 0 : 50_000 - decayed;
        return uint24(f < 3000 ? 3000 : f);
    }

    function _runAuctionArbs() internal {
        for (uint256 i; i < 30; ++i) {
            hook.poke(key);
            if (_mode() == ReopenCrossHook.Mode.Normal) {
                _arb(key, 3000); // back to the normal fee
                break;
            }
            _arb(key, _corvexFee());
            vm.roll(block.number + 1);
        }
    }

    /// @dev PnL is the LP position at the fair price after the weekend, minus its value before (quote units).
    function _report(string memory name, int256 a, int256 b, int256 c) internal pure {
        console2.log(name);
        console2.log("  LP PnL, no hook      ", a);
        console2.log("  LP PnL, fee-only hook", b);
        console2.log("  LP PnL, Corvex       ", c);
        if (a < 0) {
            uint256 lossA = uint256(-a);
            console2.log("  share of the no-hook loss avoided, bps (fee-only):", _kept(lossA, b));
            console2.log("  share of the no-hook loss avoided, bps (Corvex)  :", _kept(lossA, c));
        }
    }

    function _kept(uint256 lossA, int256 pnl) internal pure returns (uint256) {
        if (pnl >= 0) return 10_000;
        uint256 loss = uint256(-pnl);
        return loss >= lossA ? 0 : (lossA - loss) * 10_000 / lossA;
    }

    // ---- scenarios ------------------------------------------------------------------------------

    /// @dev Weekend flow into stale prices, then a 6% gap at the open.
    function test_replay_weekendFlowAndGap() public {
        _closeMarket();

        // The same weekend flow in every pool: two large buys and a sell, at Friday's price.
        _swapOn(keyA, alice, true, _q(5000), _farLimit(true), "");
        _swapOn(keyA, bob, true, _q(8000), _farLimit(true), "");
        _swapOn(keyA, dave, false, _u(30), _farLimit(false), "");
        _swapOn(keyB, alice, true, _q(5000), _farLimit(true), "");
        _swapOn(keyB, bob, true, _q(8000), _farLimit(true), "");
        _swapOn(keyB, dave, false, _u(30), _farLimit(false), "");
        _swapIn(alice, true, _q(5000), 0); // queued by Corvex
        _swapIn(bob, true, _q(8000), 0);
        _swapIn(dave, false, _u(30), 0);

        _openMarketAt(T0 + 3 days, 212e8);

        // Pool A: the first bot at the open takes whatever gap is left.
        _arb(keyA, 3000);
        // Pool B: the fee reacts to the dislocation; arbs trade until the fee eats the gap.
        for (uint256 i; i < 20; ++i) {
            if (!_arb(keyB, feeHook.feeFor(keyB))) break;
        }
        // Pool C: one cross, then the auction closes whatever is left.
        hook.executeCross(key);
        _runAuctionArbs();

        int256 a = _lpPnl(keyA);
        int256 b = _lpPnl(keyB);
        int256 c = _lpPnl(key);
        _report("weekend flow + 6% gap", a, b, c);

        assertLt(a, 0, "the unprotected pool loses");
        assertGe(_kept(uint256(-a), c), 8000, "Corvex LPs keep at least 80% of the no-hook loss");
    }

    /// @dev No queued orders: the gap is closed only by the auction.
    function test_replay_gapClosedByAuctionOnly() public {
        _closeMarket();
        _openMarketAt(T0 + 3 days, 212e8);

        _arb(keyA, 3000);
        for (uint256 i; i < 20; ++i) {
            if (!_arb(keyB, feeHook.feeFor(keyB))) break;
        }
        hook.executeCross(key);
        _runAuctionArbs();

        int256 a = _lpPnl(keyA);
        int256 b = _lpPnl(keyB);
        int256 c = _lpPnl(key);
        _report("6% gap, auction only", a, b, c);

        assertLt(a, 0);
        assertGt(c, a, "the auction returns part of the gap");
    }

    function _farLimit(bool buy) internal view returns (uint160) {
        bool zeroForOne = buy ? !scale.stockIs0 : scale.stockIs0;
        return zeroForOne ? TickMath.MIN_SQRT_PRICE + 1 : TickMath.MAX_SQRT_PRICE - 1;
    }
}
