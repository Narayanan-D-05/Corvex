// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {SwapParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {BeforeSwapDelta, BeforeSwapDeltaLibrary} from "@uniswap/v4-core/src/types/BeforeSwapDelta.sol";
import {LPFeeLibrary} from "@uniswap/v4-core/src/libraries/LPFeeLibrary.sol";
import {StateLibrary} from "@uniswap/v4-core/src/libraries/StateLibrary.sol";
import {AggregatorV3Interface} from "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";
import {PriceMath} from "../../src/libraries/PriceMath.sol";

/// @notice Baseline for the replay: a dynamic-fee hook that charges half of the pool's dislocation from the
/// reference price on top of a base fee. It stands in for the "fee-only" hooks that tighten spreads but still leave
/// a race at the open. The fee rule is illustrative, not a copy of any deployed hook.
contract FeeOnlyHook {
    using PoolIdLibrary for PoolKey;
    using StateLibrary for IPoolManager;

    IPoolManager public immutable poolManager;
    AggregatorV3Interface public immutable feed;
    PriceMath.Scale public scale;
    uint24 public constant BASE_FEE = 3000;
    uint24 public constant MAX_FEE = 50_000;

    constructor(IPoolManager pm, AggregatorV3Interface feed_, PriceMath.Scale memory scale_) {
        poolManager = pm;
        feed = feed_;
        scale = scale_;
        Hooks.validateHookPermissions(
            IHooks(address(this)),
            Hooks.Permissions({
                beforeInitialize: false,
                afterInitialize: false,
                beforeAddLiquidity: false,
                afterAddLiquidity: false,
                beforeRemoveLiquidity: false,
                afterRemoveLiquidity: false,
                beforeSwap: true,
                afterSwap: false,
                beforeDonate: false,
                afterDonate: false,
                beforeSwapReturnDelta: false,
                afterSwapReturnDelta: false,
                afterAddLiquidityReturnDelta: false,
                afterRemoveLiquidityReturnDelta: false
            })
        );
    }

    function feeFor(PoolKey calldata key) public view returns (uint24) {
        (uint160 sqrtP,,,) = poolManager.getSlot0(key.toId());
        uint256 pool = PriceMath.priceFromSqrt(scale, sqrtP);
        (, int256 answer,,,) = feed.latestRoundData();
        uint256 ref = uint256(answer) * 1e18 / (10 ** feed.decimals());
        uint256 disloc = PriceMath.diffBps(pool, ref);
        uint256 fee = BASE_FEE + disloc * 50; // 1 bp = 100 pips, half of it charged
        return uint24(fee > MAX_FEE ? MAX_FEE : fee);
    }

    function beforeSwap(address, PoolKey calldata key, SwapParams calldata, bytes calldata)
        external
        view
        returns (bytes4, BeforeSwapDelta, uint24)
    {
        require(msg.sender == address(poolManager), "pm");
        return (this.beforeSwap.selector, BeforeSwapDeltaLibrary.ZERO_DELTA, feeFor(key) | LPFeeLibrary.OVERRIDE_FEE_FLAG);
    }
}
