// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {FullMath} from "@uniswap/v4-core/src/libraries/FullMath.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

/// @notice Conversions between pool sqrt prices and "quote per whole stock token" prices at 18 dp.
library PriceMath {
    uint256 internal constant WAD = 1e18;

    struct Scale {
        bool stockIs0;
        uint256 stockUnit; // 10 ** stock decimals
        uint256 quoteUnit; // 10 ** quote decimals
    }

    function priceFromSqrt(Scale memory s, uint160 sqrtP) internal pure returns (uint256) {
        uint256 pX128 = FullMath.mulDiv(sqrtP, sqrtP, 1 << 64); // currency1 per currency0, X128
        if (s.stockIs0) {
            return FullMath.mulDiv(pX128, WAD * s.stockUnit, (1 << 128) * s.quoteUnit);
        }
        return FullMath.mulDiv(1 << 128, WAD * s.stockUnit, pX128) / s.quoteUnit;
    }

    function sqrtFromPrice(Scale memory s, uint256 price18) internal pure returns (uint160) {
        uint256 rawX192;
        if (s.stockIs0) {
            rawX192 = FullMath.mulDiv(price18 * s.quoteUnit, 1 << 192, WAD * s.stockUnit);
        } else {
            rawX192 = FullMath.mulDiv(WAD * s.stockUnit, 1 << 192, price18 * s.quoteUnit);
        }
        uint256 r = Math.sqrt(rawX192);
        if (r <= TickMath.MIN_SQRT_PRICE) return TickMath.MIN_SQRT_PRICE + 1;
        if (r >= TickMath.MAX_SQRT_PRICE) return TickMath.MAX_SQRT_PRICE - 1;
        return uint160(r);
    }

    /// @dev quote amount worth `stockAmt` at `price18`, rounded down.
    function toQuote(Scale memory s, uint256 stockAmt, uint256 price18) internal pure returns (uint256) {
        return FullMath.mulDiv(stockAmt, price18 * s.quoteUnit, WAD * s.stockUnit);
    }

    /// @dev stock amount bought with `quoteAmt` at `price18`, rounded down.
    function toStock(Scale memory s, uint256 quoteAmt, uint256 price18) internal pure returns (uint256) {
        return FullMath.mulDiv(quoteAmt, WAD * s.stockUnit, price18 * s.quoteUnit);
    }

    function diffBps(uint256 a, uint256 ref) internal pure returns (uint256) {
        uint256 d = a > ref ? a - ref : ref - a;
        return FullMath.mulDiv(d, 10_000, ref);
    }
}
