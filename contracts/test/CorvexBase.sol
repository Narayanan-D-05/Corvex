// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {Deployers} from "@uniswap/v4-core/test/utils/Deployers.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {LPFeeLibrary} from "@uniswap/v4-core/src/libraries/LPFeeLibrary.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {StateLibrary} from "@uniswap/v4-core/src/libraries/StateLibrary.sol";
import {SwapParams, ModifyLiquidityParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {PoolSwapTest} from "@uniswap/v4-core/src/test/PoolSwapTest.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {ReopenCrossHook} from "../src/ReopenCrossHook.sol";
import {MarketStatus} from "../src/MarketStatus.sol";
import {MockStockToken} from "../src/mocks/MockStockToken.sol";
import {MockAggregator} from "../src/mocks/MockAggregator.sol";
import {PriceMath} from "../src/libraries/PriceMath.sol";
import {SessionPrint, KIND_CLOSE, KIND_OPEN} from "../src/types/SessionPrint.sol";

/// @dev Shared fixture: a 1,000 STOCK / 200,000 USDG pool at $200 behind the Corvex hook.
abstract contract CorvexBase is Test, Deployers {
    using PoolIdLibrary for PoolKey;
    using StateLibrary for IPoolManager;

    uint160 constant HOOK_FLAGS = uint160(
        Hooks.BEFORE_INITIALIZE_FLAG | Hooks.BEFORE_SWAP_FLAG | Hooks.AFTER_SWAP_FLAG
            | Hooks.BEFORE_SWAP_RETURNS_DELTA_FLAG
    );

    ReopenCrossHook hook;
    MarketStatus market;
    MockStockToken stock;
    MockStockToken usdg;
    MockAggregator feed;
    PoolId pid;
    PriceMath.Scale scale;

    address receiver = makeAddr("receiver");
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    address carol = makeAddr("carol");
    address dave = makeAddr("dave");
    address arb = makeAddr("arb");

    uint256 constant T0 = 1_900_000_000; // a Friday afternoon, for readability only

    function _decimals() internal pure virtual returns (uint8 stockDec, uint8 quoteDec) {
        return (18, 18);
    }

    function _stockIs0() internal pure virtual returns (bool) {
        return true;
    }

    function _config() internal view virtual returns (ReopenCrossHook.Config memory) {
        return ReopenCrossHook.Config({
            stockToken: address(stock),
            feed: address(feed),
            marketStatus: address(market),
            maxStaleness: 1 hours,
            bandBps: 200,
            plausibilityBps: 2000,
            queueCap: 50,
            timeout: 24 hours,
            normalFee: 3000,
            auctionStartFee: 50_000,
            auctionDecayPerBlock: 2500,
            auctionExitBps: 50
        });
    }

    function setUp() public virtual {
        vm.warp(T0);
        deployFreshManagerAndRouters();

        (uint8 sd, uint8 qd) = _decimals();
        stock = new MockStockToken("Tesla Stock Token", "TSLA", sd);
        usdg = new MockStockToken("USDG", "USDG", qd);
        while ((address(stock) < address(usdg)) != _stockIs0()) {
            stock = new MockStockToken("Tesla Stock Token", "TSLA", sd);
        }
        feed = new MockAggregator(8, 200e8);
        market = new MarketStatus(address(this), true);

        address hookAddr = address(uint160(HOOK_FLAGS) ^ (0x4444 << 144));
        deployCodeTo("ReopenCrossHook.sol:ReopenCrossHook", abi.encode(address(manager), address(this)), hookAddr);
        hook = ReopenCrossHook(hookAddr);
        hook.setReceiver(receiver);

        (Currency c0, Currency c1) = address(stock) < address(usdg)
            ? (Currency.wrap(address(stock)), Currency.wrap(address(usdg)))
            : (Currency.wrap(address(usdg)), Currency.wrap(address(stock)));
        key = PoolKey(c0, c1, LPFeeLibrary.DYNAMIC_FEE_FLAG, 60, IHooks(hookAddr));
        pid = key.toId();
        bool stockIs0 = Currency.unwrap(c0) == address(stock);
        scale = PriceMath.Scale({
            stockIs0: stockIs0,
            stockUnit: 10 ** sd,
            quoteUnit: 10 ** qd
        });

        hook.configure(key, _config());
        manager.initialize(key, PriceMath.sqrtFromPrice(scale, 200e18));

        // Liquidity: 1,000 STOCK against 200,000 USDG, full range.
        stock.mint(address(this), 1_000_000 * 10 ** sd);
        usdg.mint(address(this), 100_000_000 * 10 ** qd);
        stock.approve(address(modifyLiquidityRouter), type(uint256).max);
        usdg.approve(address(modifyLiquidityRouter), type(uint256).max);
        modifyLiquidityRouter.modifyLiquidity(
            key, ModifyLiquidityParams(-887_220, 887_220, int256(_liquidity()), 0), ""
        );

        address[5] memory users = [alice, bob, carol, dave, arb];
        for (uint256 i; i < users.length; ++i) {
            stock.mint(users[i], 10_000 * 10 ** sd);
            usdg.mint(users[i], 10_000_000 * 10 ** qd);
            vm.startPrank(users[i]);
            stock.approve(address(swapRouter), type(uint256).max);
            usdg.approve(address(swapRouter), type(uint256).max);
            vm.stopPrank();
        }
    }

    /// @dev sqrt(1000 * 200000) at 18 dp scale of the pool's raw units.
    function _liquidity() internal view virtual returns (uint256) {
        (uint8 sd, uint8 qd) = _decimals();
        // L = sqrt(x * y) in raw units
        return _sqrt((1000 * 10 ** sd) * (200_000 * 10 ** qd));
    }

    function _sqrt(uint256 x) internal pure returns (uint256 r) {
        if (x == 0) return 0;
        r = x;
        uint256 z = (x + 1) / 2;
        while (z < r) {
            r = z;
            z = (x / z + z) / 2;
        }
    }

    // ---- helpers --------------------------------------------------------------------------------

    function _u(uint256 stockUnits) internal view returns (uint256) {
        (uint8 sd,) = _decimals();
        return stockUnits * 10 ** sd;
    }

    function _q(uint256 quoteUnits) internal view returns (uint256) {
        (, uint8 qd) = _decimals();
        return quoteUnits * 10 ** qd;
    }

    /// @dev Exact-input swap. `buy` spends quote for stock. limit 0 = no limit.
    function _swapIn(address who, bool buy, uint256 amountIn, uint256 limitPrice) internal returns (BalanceDelta) {
        bool zeroForOne = buy ? !scale.stockIs0 : scale.stockIs0;
        uint160 lim = zeroForOne ? TickMath.MIN_SQRT_PRICE + 1 : TickMath.MAX_SQRT_PRICE - 1;
        vm.prank(who);
        return swapRouter.swap(
            key,
            SwapParams(zeroForOne, -int256(amountIn), lim),
            _settings(),
            abi.encode(who, limitPrice)
        );
    }

    function _settings() internal pure returns (PoolSwapTest.TestSettings memory) {
        return PoolSwapTest.TestSettings({takeClaims: false, settleUsingBurn: false});
    }

    function _price() internal view returns (uint256) {
        (uint160 sqrtP,,,) = manager.getSlot0(pid);
        return PriceMath.priceFromSqrt(scale, sqrtP);
    }

    function _state() internal view returns (ReopenCrossHook.PoolState memory) {
        return hook.getState(pid);
    }

    function _mode() internal view returns (ReopenCrossHook.Mode) {
        return _state().mode;
    }

    function _closeMarket() internal {
        market.setOpen(false);
        hook.poke(key);
    }

    function _openMarketAt(uint256 ts, int256 answer) internal {
        vm.warp(ts);
        market.setOpen(true);
        feed.setAnswer(answer);
    }

    function _credit(address who, bool inStock) internal view returns (uint256) {
        return hook.credits(who, inStock ? address(stock) : address(usdg));
    }

    function _balance(address token, address who) internal view returns (uint256) {
        return IERC20(token).balanceOf(who);
    }
}
