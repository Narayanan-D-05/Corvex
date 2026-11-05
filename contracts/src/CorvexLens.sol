// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {StateLibrary} from "@uniswap/v4-core/src/libraries/StateLibrary.sol";
import {AggregatorV3Interface} from "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";

import {ReopenCrossHook} from "./ReopenCrossHook.sol";
import {IERC8056} from "./interfaces/IERC8056.sol";
import {IMarketStatus} from "./interfaces/IMarketStatus.sol";
import {PriceMath} from "./libraries/PriceMath.sol";

/// @notice Read-only helper for the frontend: everything the status banner, reopen lights and queue book need,
/// in one call.
contract CorvexLens {
    using PoolIdLibrary for PoolKey;
    using StateLibrary for IPoolManager;

    struct Snapshot {
        ReopenCrossHook.Mode mode;
        uint64 sessionId;
        uint256 poolPrice; // quote per token, 18 dp
        uint128 liquidity;
        uint256 refPrice; // latest feed price, 0 if the feed is invalid
        uint256 darkRefPrice;
        uint256 crossPrice;
        uint256 multiplier;
        uint256 expectedMultiplier;
        uint40 darkFrom;
        uint40 reopenAt;
        uint40 awaitingSince;
        uint256 openOrders;
        uint256 totalOrders;
        bool marketOpen;
        bool oraclePaused;
        bool feedFresh;
        bool multiplierOk;
        bool plausible;
        bool scheduleClear;
        bool expired;
    }

    IPoolManager public immutable poolManager;

    constructor(IPoolManager pm) {
        poolManager = pm;
    }

    function snapshot(ReopenCrossHook hook, PoolKey calldata key) external view returns (Snapshot memory r) {
        PoolId id = key.toId();
        ReopenCrossHook.PoolState memory s = hook.getState(id);
        ReopenCrossHook.PoolConfig memory pc = hook.getConfig(id);
        ReopenCrossHook.Config memory c = pc.cfg;

        r.mode = s.mode;
        r.sessionId = s.sessionId;
        r.darkRefPrice = s.darkRefPrice;
        r.crossPrice = s.crossPrice;
        r.expectedMultiplier = s.expectedMultiplier;
        r.darkFrom = s.darkFrom;
        r.reopenAt = s.reopenAt;
        r.awaitingSince = s.awaitingSince;

        (uint160 sqrtP,,,) = poolManager.getSlot0(id);
        r.poolPrice = PriceMath.priceFromSqrt(pc.scale, sqrtP);
        r.liquidity = poolManager.getLiquidity(id);

        (, int256 answer,, uint256 updatedAt,) = AggregatorV3Interface(c.feed).latestRoundData();
        if (answer > 0) {
            r.refPrice = uint256(answer) * 1e18 / (10 ** pc.feedDecimals);
            r.feedFresh = updatedAt <= block.timestamp && block.timestamp - updatedAt <= c.maxStaleness;
        }

        r.multiplier = IERC8056(c.stockToken).uiMultiplier();
        r.oraclePaused = IERC8056(c.stockToken).oraclePaused();
        r.marketOpen = IMarketStatus(c.marketStatus).isOpen();
        r.scheduleClear = !(s.darkFrom != 0 && block.timestamp >= s.darkFrom && block.timestamp < s.reopenAt);
        r.multiplierOk = s.expectedMultiplier == 0 || r.multiplier == s.expectedMultiplier;
        r.plausible = r.refPrice != 0 && (s.darkRefPrice == 0 || PriceMath.diffBps(r.refPrice, s.darkRefPrice) <= c.plausibilityBps);

        ReopenCrossHook.Order[] memory orders = hook.getOrders(id, s.sessionId);
        r.totalOrders = orders.length;
        for (uint256 i; i < orders.length; ++i) {
            if (orders[i].status == ReopenCrossHook.Status.Open) r.openOrders++;
        }

        if (s.mode == ReopenCrossHook.Mode.AwaitingReopen) {
            uint256 from = s.awaitingSince > s.reopenAt ? s.awaitingSince : s.reopenAt;
            r.expired = block.timestamp > from + c.timeout;
        }
    }
}
