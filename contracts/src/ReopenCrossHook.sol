// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {CurrencySettler} from "@openzeppelin/uniswap-hooks/src/utils/CurrencySettler.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {Currency, CurrencyLibrary} from "@uniswap/v4-core/src/types/Currency.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {SwapParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {
    BeforeSwapDelta,
    BeforeSwapDeltaLibrary,
    toBeforeSwapDelta
} from "@uniswap/v4-core/src/types/BeforeSwapDelta.sol";
import {LPFeeLibrary} from "@uniswap/v4-core/src/libraries/LPFeeLibrary.sol";
import {StateLibrary} from "@uniswap/v4-core/src/libraries/StateLibrary.sol";
import {SqrtPriceMath} from "@uniswap/v4-core/src/libraries/SqrtPriceMath.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {AggregatorV3Interface} from "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";

import {IERC8056} from "./interfaces/IERC8056.sol";
import {IMarketStatus} from "./interfaces/IMarketStatus.sol";
import {IPrintBroadcaster} from "./interfaces/IPrintBroadcaster.sol";
import {SessionPrint, KIND_CLOSE, KIND_OPEN} from "./types/SessionPrint.sol";
import {PriceMath} from "./libraries/PriceMath.sol";

/// @title ReopenCrossHook
/// @notice Uniswap v4 hook for stock-token pools. While the reference is dark it queues large trades; at the
/// reopen it clears them in one uniform-price cross, donates the surplus to LPs and records a Session Print.
/// The leftover gap is closed through a decaying-fee auction (modelled on Uniswap's StablePair hook).
contract ReopenCrossHook is Ownable {
    using PoolIdLibrary for PoolKey;
    using CurrencyLibrary for Currency;
    using CurrencySettler for Currency;
    using StateLibrary for IPoolManager;
    using PriceMath for PriceMath.Scale;

    enum Mode {
        Normal,
        Dark,
        AwaitingReopen,
        Auction
    }
    enum Reason {
        None,
        MarketClosed,
        OraclePaused,
        StaleFeed,
        Scheduled,
        MissedClose
    }
    enum Status {
        Open,
        Filled,
        Partial,
        Refunded,
        Cancelled
    }
    enum Action {
        Cross,
        Withdraw,
        Deposit
    }

    /// @notice Per-pool configuration, set once by the owner before the pool is initialized.
    struct Config {
        address stockToken;
        address feed; // token-price feed, already multiplier-adjusted
        address marketStatus; // IMarketStatus
        uint32 maxStaleness; // seconds
        uint16 bandBps; // in-band swaps execute while dark (default 200)
        uint16 plausibilityBps; // max reopen move vs the pre-dark price (default 2000)
        uint16 queueCap; // open orders per session (default 50)
        uint32 timeout; // seconds past the scheduled reopen before the queue is refundable
        uint24 normalFee; // pips
        uint24 auctionStartFee; // pips, e.g. 50_000 = 5%
        uint24 auctionDecayPerBlock; // pips removed per block
        uint16 auctionExitBps; // normal mode resumes within this distance of the cross price
    }

    struct PoolConfig {
        Config cfg;
        PriceMath.Scale scale;
        uint8 feedDecimals;
        bool set;
    }

    struct PoolState {
        Mode mode;
        uint64 sessionId; // session the next open print belongs to; closes use the previous id
        uint40 awaitingSince;
        uint40 darkFrom; // CCIP schedule: may enter dark early, never exits
        uint40 reopenAt;
        uint64 auctionStartBlock;
        uint256 lastRefPrice; // last checked reference price (18 dp)
        uint256 darkRefPrice; // band anchor while dark
        uint256 crossPrice; // p* of the last cross
        uint256 expectedMultiplier; // from the schedule; 0 = no corporate action
        uint256 seenCloseCount;
    }

    struct Order {
        address owner;
        bool buy; // true: input is quote, buys the stock
        Status status;
        uint64 srcSelector; // 0 = placed on this chain
        uint128 amountIn;
        uint256 limitPrice; // buys: max price, sells: min price (18 dp)
    }

    uint256 public constant MAX_SCHEDULE_WINDOW = 10 days;

    mapping(PoolId => PoolConfig) internal _cfg;
    mapping(PoolId => PoolState) internal _state;
    mapping(PoolId => mapping(uint64 => Order[])) internal _orders;
    mapping(PoolId => mapping(uint64 => uint32)) public openCount;
    mapping(PoolId => mapping(uint64 => mapping(uint8 => SessionPrint))) internal _prints;

    /// @notice Owed to users: unfilled input and fills, held as ERC-6909 claims by this hook.
    mapping(address user => mapping(address currency => uint256)) public credits;
    /// @dev Sum of open order inputs and credits per currency; claims above this are surplus.
    mapping(address currency => uint256) public liabilities;

    address public receiver; // ReopenReceiver: schedules and cross-chain orders
    address public broadcaster; // PrintBroadcaster

    event ModeChanged(bytes32 indexed poolId, Mode from, Mode to, Reason reason);
    event OrderQueued(
        bytes32 indexed poolId,
        uint64 indexed sessionId,
        uint256 index,
        address indexed owner,
        bool buy,
        uint256 amountIn,
        uint256 limitPrice,
        uint64 srcSelector
    );
    event OrderSettled(
        bytes32 indexed poolId,
        uint64 indexed sessionId,
        uint256 index,
        address indexed owner,
        Status status,
        uint256 stockCredited,
        uint256 quoteCredited
    );
    event OrderCancelled(bytes32 indexed poolId, uint64 indexed sessionId, uint256 index, address indexed owner);
    event CrossExecuted(
        bytes32 indexed poolId,
        uint64 indexed sessionId,
        uint256 price,
        uint256 volume,
        uint32 orders,
        uint256 donated0,
        uint256 donated1
    );
    event SessionPrintRecorded(
        bytes32 indexed poolId, uint64 indexed sessionId, uint8 kind, uint256 tokenPrice, uint256 multiplier, uint256 crossVolume, uint32 orderCount
    );
    event PrintBroadcastFailed(bytes32 indexed poolId, uint64 sessionId, uint8 kind);
    event ScheduleApplied(bytes32 indexed poolId, uint40 darkFrom, uint40 reopenAt, uint256 expectedMultiplier);
    event Withdrawn(address indexed user, address indexed currency, address to, uint256 amount);
    event PoolConfigured(bytes32 indexed poolId, address stockToken, address feed, address marketStatus);

    error NotConfigured();
    error AlreadyConfigured();
    error NotDynamicFee();
    error StockNotInPool();
    error OnlyReceiver();
    error CrossPending();
    error QueueFull();
    error ExactOutputNotQueueable();
    error NotQueueable();
    error NotAwaiting();
    error MarketClosed();
    error OraclePaused();
    error StaleFeed();
    error ScheduleActive();
    error MultiplierNotUpdated();
    error ImplausibleJump();
    error ExceedsBand();
    error NotCancellable();
    error NotOwnerOrExpired();
    error BadSchedule();
    error CrossInsolvent();
    error NothingToWithdraw();
    error BadConfig();

    IPoolManager public immutable poolManager;

    error NotPoolManager();
    error InvalidPool();

    modifier onlyPoolManager() {
        if (msg.sender != address(poolManager)) revert NotPoolManager();
        _;
    }

    modifier onlyValidPools(IHooks hooks) {
        if (address(hooks) != address(this)) revert InvalidPool();
        _;
    }

    /// @dev Only the three callbacks this hook enables are implemented; the pool manager never calls the rest.
    constructor(IPoolManager pm, address owner_) Ownable(owner_) {
        poolManager = pm;
        Hooks.validateHookPermissions(IHooks(address(this)), getHookPermissions());
    }

    // ---------------------------------------------------------------------------------------------
    // Admin
    // ---------------------------------------------------------------------------------------------

    function setReceiver(address r) external onlyOwner {
        receiver = r;
    }

    function setBroadcaster(address b) external onlyOwner {
        broadcaster = b;
    }

    /// @notice Sets a pool's parameters. Call once, before `PoolManager.initialize` (v4 passes no hook data on
    /// initialize, so configuration lives here instead).
    function configure(PoolKey calldata key, Config calldata cfg) external onlyOwner onlyValidPools(key.hooks) {
        PoolId id = key.toId();
        if (_cfg[id].set) revert AlreadyConfigured();
        if (!LPFeeLibrary.isDynamicFee(key.fee)) revert NotDynamicFee();
        if (cfg.bandBps == 0 || cfg.queueCap == 0 || cfg.plausibilityBps == 0 || cfg.maxStaleness == 0) {
            revert BadConfig();
        }
        address s = cfg.stockToken;
        bool stockIs0 = Currency.unwrap(key.currency0) == s;
        if (!stockIs0 && Currency.unwrap(key.currency1) != s) revert StockNotInPool();
        address quote = Currency.unwrap(stockIs0 ? key.currency1 : key.currency0);

        PoolConfig storage pc = _cfg[id];
        pc.cfg = cfg;
        pc.scale = PriceMath.Scale({
            stockIs0: stockIs0,
            stockUnit: 10 ** IERC20Metadata(s).decimals(),
            quoteUnit: 10 ** IERC20Metadata(quote).decimals()
        });
        pc.feedDecimals = AggregatorV3Interface(cfg.feed).decimals();
        pc.set = true;
        emit PoolConfigured(PoolId.unwrap(id), s, cfg.feed, cfg.marketStatus);
    }

    // ---------------------------------------------------------------------------------------------
    // Hook callbacks
    // ---------------------------------------------------------------------------------------------

    function getHookPermissions() public pure returns (Hooks.Permissions memory p) {
        p.beforeInitialize = true;
        p.beforeSwap = true;
        p.afterSwap = true;
        p.beforeSwapReturnDelta = true;
    }

    function beforeInitialize(address, PoolKey calldata key, uint160) external onlyPoolManager returns (bytes4) {
        PoolId id = key.toId();
        PoolConfig storage pc = _cfg[id];
        if (!pc.set) revert NotConfigured();
        (uint256 price, bool fresh) = _feedPrice(pc);
        if (!fresh) revert StaleFeed();
        PoolState storage s = _state[id];
        s.lastRefPrice = price;
        s.seenCloseCount = IMarketStatus(pc.cfg.marketStatus).closeCount();
        return this.beforeInitialize.selector;
    }

    function beforeSwap(address sender, PoolKey calldata key, SwapParams calldata params, bytes calldata hookData)
        external
        onlyPoolManager
        returns (bytes4, BeforeSwapDelta, uint24)
    {
        PoolId id = key.toId();
        PoolConfig storage pc = _cfg[id];
        PoolState storage s = _state[id];
        _sync(id, pc, s);

        if (s.mode == Mode.AwaitingReopen) revert CrossPending(); // ordering guard

        if (s.mode == Mode.Dark) {
            if (!_staysInBand(key, id, pc, s, params)) {
                int128 taken = _queueFromSwap(key, id, pc, s, sender, params, hookData);
                return (this.beforeSwap.selector, toBeforeSwapDelta(taken, 0), 0);
            }
            return (this.beforeSwap.selector, BeforeSwapDeltaLibrary.ZERO_DELTA, pc.cfg.normalFee | LPFeeLibrary.OVERRIDE_FEE_FLAG);
        }

        uint24 fee = s.mode == Mode.Auction ? _auctionFee(key, id, pc, s, params) : pc.cfg.normalFee;
        return (this.beforeSwap.selector, BeforeSwapDeltaLibrary.ZERO_DELTA, fee | LPFeeLibrary.OVERRIDE_FEE_FLAG);
    }

    /// @dev Safety net: no swap may leave the band while dark, whatever the pre-swap estimate said.
    function afterSwap(address, PoolKey calldata key, SwapParams calldata, BalanceDelta, bytes calldata)
        external
        onlyPoolManager
        returns (bytes4, int128)
    {
        PoolId id = key.toId();
        PoolState storage s = _state[id];
        PoolConfig storage pc = _cfg[id];
        if (s.mode == Mode.Dark) {
            uint256 p = _poolPrice(id, pc);
            if (PriceMath.diffBps(p, s.darkRefPrice) > pc.cfg.bandBps) revert ExceedsBand();
        } else if (s.mode == Mode.Auction) {
            _maybeEndAuction(id, pc, s);
        }
        return (this.afterSwap.selector, 0);
    }

    // ---------------------------------------------------------------------------------------------
    // Mode machine
    // ---------------------------------------------------------------------------------------------

    /// @notice Permissionless: lets a keeper record the closing print and move the mode without a swap.
    function poke(PoolKey calldata key) external onlyValidPools(key.hooks) {
        PoolId id = key.toId();
        PoolConfig storage pc = _cfg[id];
        if (!pc.set) revert NotConfigured();
        _sync(id, pc, _state[id]);
    }

    function _sync(PoolId id, PoolConfig storage pc, PoolState storage s) internal {
        Mode m = s.mode;
        Reason r = _darkReason(pc, s);
        if (m == Mode.Normal || m == Mode.Auction) {
            if (r == Reason.None && IMarketStatus(pc.cfg.marketStatus).closeCount() != s.seenCloseCount) {
                r = Reason.MissedClose;
            }
            if (r != Reason.None) {
                _goDark(id, pc, s, r);
                return;
            }
            (uint256 price,) = _feedPrice(pc);
            s.lastRefPrice = price;
            if (m == Mode.Auction) _maybeEndAuction(id, pc, s);
        } else if (m == Mode.Dark) {
            if (r == Reason.None) {
                s.mode = Mode.AwaitingReopen;
                s.awaitingSince = uint40(block.timestamp);
                emit ModeChanged(PoolId.unwrap(id), Mode.Dark, Mode.AwaitingReopen, Reason.None);
            }
        } else if (r != Reason.None) {
            s.mode = Mode.Dark;
            emit ModeChanged(PoolId.unwrap(id), Mode.AwaitingReopen, Mode.Dark, r);
        }
    }

    function _darkReason(PoolConfig storage pc, PoolState storage s) internal view returns (Reason) {
        Config storage c = pc.cfg;
        if (!IMarketStatus(c.marketStatus).isOpen()) return Reason.MarketClosed;
        if (IERC8056(c.stockToken).oraclePaused()) return Reason.OraclePaused;
        (, bool fresh) = _feedPrice(pc);
        if (!fresh) return Reason.StaleFeed;
        if (s.darkFrom != 0 && block.timestamp >= s.darkFrom && block.timestamp < s.reopenAt) return Reason.Scheduled;
        return Reason.None;
    }

    function _goDark(PoolId id, PoolConfig storage pc, PoolState storage s, Reason r) internal {
        Mode from = s.mode;
        uint256 p = s.lastRefPrice;
        if (r != Reason.MissedClose) {
            // The feed still holds the last price printed before it went quiet.
            (uint256 latest,) = _feedPrice(pc);
            if (latest != 0) p = latest;
        }
        uint64 closing = s.sessionId;
        s.darkRefPrice = p;
        s.sessionId = closing + 1;
        s.mode = Mode.Dark;
        s.seenCloseCount = IMarketStatus(pc.cfg.marketStatus).closeCount();
        emit ModeChanged(PoolId.unwrap(id), from, Mode.Dark, r);
        _recordPrint(id, pc, KIND_CLOSE, closing, p, 0, 0);
    }

    function _maybeEndAuction(PoolId id, PoolConfig storage pc, PoolState storage s) internal {
        Config storage c = pc.cfg;
        uint256 p = _poolPrice(id, pc);
        bool near = PriceMath.diffBps(p, s.crossPrice) <= c.auctionExitBps;
        uint256 decayed = (block.number - s.auctionStartBlock) * c.auctionDecayPerBlock;
        bool feeFloor = decayed >= uint256(c.auctionStartFee) - c.normalFee;
        if (near || feeFloor) {
            s.mode = Mode.Normal;
            emit ModeChanged(PoolId.unwrap(id), Mode.Auction, Mode.Normal, Reason.None);
        }
    }

    // ---------------------------------------------------------------------------------------------
    // Feed and price helpers
    // ---------------------------------------------------------------------------------------------

    function _feedPrice(PoolConfig storage pc) internal view returns (uint256 price, bool fresh) {
        (, int256 answer,, uint256 updatedAt,) = AggregatorV3Interface(pc.cfg.feed).latestRoundData();
        if (answer <= 0) return (0, false);
        price = uint256(answer) * 1e18 / (10 ** pc.feedDecimals);
        fresh = updatedAt <= block.timestamp && block.timestamp - updatedAt <= pc.cfg.maxStaleness;
    }

    function _poolPrice(PoolId id, PoolConfig storage pc) internal view returns (uint256) {
        (uint160 sqrtP,,,) = poolManager.getSlot0(id);
        return pc.scale.priceFromSqrt(sqrtP);
    }

    /// @dev Single-range estimate of the price after the swap, clamped by the swap's price limit.
    function _staysInBand(PoolKey calldata, PoolId id, PoolConfig storage pc, PoolState storage s, SwapParams calldata p)
        internal
        view
        returns (bool)
    {
        (uint160 sqrtP,,,) = poolManager.getSlot0(id);
        uint128 liq = poolManager.getLiquidity(id);
        if (liq == 0) return true; // the pool manager reverts an empty-pool swap on its own

        uint160 next;
        if (p.amountSpecified < 0) {
            next = SqrtPriceMath.getNextSqrtPriceFromInput(sqrtP, liq, uint256(-p.amountSpecified), p.zeroForOne);
        } else {
            next = SqrtPriceMath.getNextSqrtPriceFromOutput(sqrtP, liq, uint256(p.amountSpecified), p.zeroForOne);
        }
        if (p.zeroForOne ? next < p.sqrtPriceLimitX96 : next > p.sqrtPriceLimitX96) next = p.sqrtPriceLimitX96;
        uint256 price = pc.scale.priceFromSqrt(next);
        return PriceMath.diffBps(price, s.darkRefPrice) <= pc.cfg.bandBps;
    }

    function _isBuy(PoolConfig storage pc, bool zeroForOne) internal view returns (bool) {
        return pc.scale.stockIs0 ? !zeroForOne : zeroForOne;
    }

    function _auctionFee(PoolKey calldata, PoolId id, PoolConfig storage pc, PoolState storage s, SwapParams calldata p)
        internal
        view
        returns (uint24)
    {
        Config storage c = pc.cfg;
        uint256 price = _poolPrice(id, pc);
        bool buy = _isBuy(pc, p.zeroForOne);
        bool toward = (price < s.crossPrice && buy) || (price > s.crossPrice && !buy);
        if (!toward) return c.normalFee;
        uint256 decayed = (block.number - s.auctionStartBlock) * c.auctionDecayPerBlock;
        uint256 start = c.auctionStartFee;
        uint256 fee = decayed >= start ? 0 : start - decayed;
        return uint24(fee < c.normalFee ? c.normalFee : fee);
    }

    // ---------------------------------------------------------------------------------------------
    // Queue
    // ---------------------------------------------------------------------------------------------

    function _queueFromSwap(
        PoolKey calldata key,
        PoolId id,
        PoolConfig storage pc,
        PoolState storage s,
        address sender,
        SwapParams calldata params,
        bytes calldata hookData
    ) internal returns (int128 taken) {
        if (params.amountSpecified >= 0) revert ExactOutputNotQueueable();
        address owner_ = sender;
        uint256 limit;
        if (hookData.length >= 64) (owner_, limit) = abi.decode(hookData, (address, uint256));

        Currency input = params.zeroForOne ? key.currency0 : key.currency1;
        bool buy = _isBuy(pc, params.zeroForOne);
        uint256 amount = uint256(-params.amountSpecified);

        _pushOrder(id, pc, s, owner_, buy, amount, limit, 0);
        input.take(poolManager, address(this), amount, true); // custody as ERC-6909 claims
        liabilities[Currency.unwrap(input)] += amount;
        taken = int128(int256(amount));
    }

    function _pushOrder(
        PoolId id,
        PoolConfig storage pc,
        PoolState storage s,
        address owner_,
        bool buy,
        uint256 amount,
        uint256 limit,
        uint64 srcSelector
    ) internal {
        uint64 session = s.sessionId;
        if (openCount[id][session] >= pc.cfg.queueCap || _orders[id][session].length >= 3 * uint256(pc.cfg.queueCap)) {
            revert QueueFull();
        }
        if (limit == 0) limit = buy ? type(uint256).max : 0; // no limit
        if (amount == 0 || amount > type(uint128).max) revert BadConfig();

        Order[] storage q = _orders[id][session];
        q.push(
            Order({
                owner: owner_,
                buy: buy,
                status: Status.Open,
                srcSelector: srcSelector,
                amountIn: uint128(amount),
                limitPrice: limit
            })
        );
        openCount[id][session] += 1;
        emit OrderQueued(PoolId.unwrap(id), session, q.length - 1, owner_, buy, amount, limit, srcSelector);
    }

    /// @notice Queues a buy that arrived over CCIP. The receiver approves this hook first; the quote token is
    /// pulled in during the call, so a revert here leaves the tokens with the receiver.
    function queueExternal(PoolKey calldata key, address owner_, uint256 amountIn, uint256 limitPrice, uint64 srcSelector)
        external
       
        onlyValidPools(key.hooks)
    {
        if (msg.sender != receiver) revert OnlyReceiver();
        PoolId id = key.toId();
        PoolConfig storage pc = _cfg[id];
        PoolState storage s = _state[id];
        _sync(id, pc, s);
        if (s.mode != Mode.Dark) revert NotQueueable();

        Currency quote = pc.scale.stockIs0 ? key.currency1 : key.currency0;
        _pushOrder(id, pc, s, owner_, true, amountIn, limitPrice, srcSelector);
        liabilities[Currency.unwrap(quote)] += amountIn;
        poolManager.unlock(abi.encode(Action.Deposit, abi.encode(quote, msg.sender, amountIn)));
    }

    /// @notice Cancels an open order for a full refund, until the cross starts. After the timeout anyone can.
    function cancel(PoolKey calldata key, uint64 sessionId, uint256 index) external onlyValidPools(key.hooks) {
        PoolId id = key.toId();
        PoolState storage s = _state[id];
        if (s.mode != Mode.Dark && s.mode != Mode.AwaitingReopen) revert NotCancellable();
        if (sessionId != s.sessionId) revert NotCancellable();
        Order storage o = _orders[id][sessionId][index];
        if (o.status != Status.Open) revert NotCancellable();
        if (msg.sender != o.owner && !_isExpired(_cfg[id], s)) revert NotOwnerOrExpired();

        o.status = Status.Cancelled;
        openCount[id][sessionId] -= 1;
        address cur = _inputCurrency(key, _cfg[id], o.buy);
        credits[o.owner][cur] += o.amountIn; // liabilities unchanged: open input becomes credit
        emit OrderCancelled(PoolId.unwrap(id), sessionId, index, o.owner);
    }

    function _isExpired(PoolConfig storage pc, PoolState storage s) internal view returns (bool) {
        if (s.mode != Mode.AwaitingReopen) return false;
        uint256 from = s.awaitingSince > s.reopenAt ? s.awaitingSince : s.reopenAt;
        return block.timestamp > from + pc.cfg.timeout;
    }

    function _inputCurrency(PoolKey calldata key, PoolConfig storage pc, bool buy) internal view returns (address) {
        bool stockIs0 = pc.scale.stockIs0;
        // buy: input is quote
        Currency c = buy ? (stockIs0 ? key.currency1 : key.currency0) : (stockIs0 ? key.currency0 : key.currency1);
        return Currency.unwrap(c);
    }

    // ---------------------------------------------------------------------------------------------
    // Schedule (CCIP, F18)
    // ---------------------------------------------------------------------------------------------

    /// @notice Announces a dark window. It can move the pool into dark mode early; it never ends one.
    function applySchedule(PoolId id, uint40 darkFrom, uint40 reopenAt, uint256 expectedMultiplier) external {
        if (msg.sender != receiver) revert OnlyReceiver();
        if (!_cfg[id].set) revert NotConfigured();
        if (reopenAt <= darkFrom || reopenAt - darkFrom > MAX_SCHEDULE_WINDOW || reopenAt <= block.timestamp) {
            revert BadSchedule();
        }
        PoolState storage s = _state[id];
        s.darkFrom = darkFrom;
        s.reopenAt = reopenAt;
        s.expectedMultiplier = expectedMultiplier;
        emit ScheduleApplied(PoolId.unwrap(id), darkFrom, reopenAt, expectedMultiplier);
    }

    // ---------------------------------------------------------------------------------------------
    // Reopen checks and the cross
    // ---------------------------------------------------------------------------------------------

    /// @dev The four reopen checks (plus the schedule window). Reverts with the failing reason.
    function _checkedReopenPrice(PoolConfig storage pc, PoolState storage s) internal view returns (uint256 p) {
        Config storage c = pc.cfg;
        if (!IMarketStatus(c.marketStatus).isOpen()) revert MarketClosed();
        if (IERC8056(c.stockToken).oraclePaused()) revert OraclePaused();
        bool fresh;
        (p, fresh) = _feedPrice(pc);
        if (!fresh) revert StaleFeed();
        if (s.darkFrom != 0 && block.timestamp >= s.darkFrom && block.timestamp < s.reopenAt) revert ScheduleActive();
        if (s.expectedMultiplier != 0 && IERC8056(c.stockToken).uiMultiplier() != s.expectedMultiplier) {
            revert MultiplierNotUpdated();
        }
        if (s.darkRefPrice != 0 && PriceMath.diffBps(p, s.darkRefPrice) > c.plausibilityBps) revert ImplausibleJump();
    }

    /// @notice Permissionless. Clears the queue at p* = reference price, nets buys against sells, trades the
    /// imbalance against the pool, donates the surplus to LPs and records the opening print.
    function executeCross(PoolKey calldata key) external onlyValidPools(key.hooks) {
        PoolId id = key.toId();
        PoolConfig storage pc = _cfg[id];
        PoolState storage s = _state[id];
        if (!pc.set) revert NotConfigured();
        _sync(id, pc, s);
        if (s.mode != Mode.Dark && s.mode != Mode.AwaitingReopen) revert NotAwaiting();

        uint256 pStar = _checkedReopenPrice(pc, s);
        s.mode = Mode.AwaitingReopen; // checks passed; nothing else may trade until the cross settles

        uint64 session = s.sessionId;
        bytes memory out = poolManager.unlock(abi.encode(Action.Cross, abi.encode(key, pStar, session)));
        (uint256 volume, uint32 filled, uint256 d0, uint256 d1) = abi.decode(out, (uint256, uint32, uint256, uint256));

        _recordPrint(id, pc, KIND_OPEN, session, pStar, volume, filled);
        s.mode = Mode.Auction;
        s.auctionStartBlock = uint64(block.number);
        s.crossPrice = pStar;
        s.lastRefPrice = pStar;
        s.darkFrom = 0;
        s.reopenAt = 0;
        s.expectedMultiplier = 0;
        emit ModeChanged(PoolId.unwrap(id), Mode.AwaitingReopen, Mode.Auction, Reason.None);
        emit CrossExecuted(PoolId.unwrap(id), session, pStar, volume, filled, d0, d1);
        // An empty queue and a pool already at p* leave nothing to auction.
        _maybeEndAuction(id, pc, s);
    }

    // ---------------------------------------------------------------------------------------------
    // Settlement (inside unlock)
    // ---------------------------------------------------------------------------------------------

    function unlockCallback(bytes calldata data) external onlyPoolManager returns (bytes memory) {
        (Action a, bytes memory payload) = abi.decode(data, (Action, bytes));
        if (a == Action.Cross) {
            (PoolKey memory key, uint256 p, uint64 session) = abi.decode(payload, (PoolKey, uint256, uint64));
            (uint256 v, uint32 n, uint256 d0, uint256 d1) = _settleCross(key, session, p);
            return abi.encode(v, n, d0, d1);
        }
        if (a == Action.Withdraw) {
            (Currency cur, address to, uint256 amount) = abi.decode(payload, (Currency, address, uint256));
            cur.settle(poolManager, address(this), amount, true);
            cur.take(poolManager, to, amount, false);
            return "";
        }
        (Currency c, address from, uint256 amt) = abi.decode(payload, (Currency, address, uint256));
        c.settle(poolManager, from, amt, false);
        c.take(poolManager, address(this), amt, true);
        return "";
    }

    struct CrossCtx {
        PoolKey key;
        PoolId id;
        uint64 session;
        uint256 p;
        Currency stockC;
        Currency quoteC;
        PriceMath.Scale sc;
        uint256 num; // fill ratio num/den applied to the short side
        uint256 den;
        bool buyersScaled;
        bool sellersScaled;
        uint256 openStock; // order input of each currency leaving the open set
        uint256 openQuote;
        uint256 creditStock;
        uint256 creditQuote;
        uint256 volume;
        uint32 filled;
    }

    function _settleCross(PoolKey memory key, uint64 session, uint256 p)
        internal
        returns (uint256 volume, uint32 filled, uint256 d0, uint256 d1)
    {
        CrossCtx memory x;
        x.key = key;
        x.id = key.toId();
        x.session = session;
        x.p = p;
        PoolConfig storage pc = _cfg[x.id];
        x.sc = pc.scale;
        x.stockC = x.sc.stockIs0 ? key.currency0 : key.currency1;
        x.quoteC = x.sc.stockIs0 ? key.currency1 : key.currency0;

        Order[] storage q = _orders[x.id][session];
        uint256 n = q.length;
        uint8[] memory cls = new uint8[](n); // 0 skip, 1 fill buy, 2 fill sell, 3 refund
        uint256 qb;
        uint256 ss;
        for (uint256 i; i < n; ++i) {
            Order storage o = q[i];
            if (o.status != Status.Open) continue;
            if (o.buy) {
                if (o.limitPrice >= p) {
                    cls[i] = 1;
                    qb += o.amountIn;
                } else {
                    cls[i] = 3;
                }
            } else {
                if (o.limitPrice <= p) {
                    cls[i] = 2;
                    ss += o.amountIn;
                } else {
                    cls[i] = 3;
                }
            }
        }

        // Net buys against sells; only the imbalance trades against the pool, never past p*.
        x.num = 1;
        x.den = 1;
        uint256 buyStock = x.sc.toStock(qb, p);
        uint256 sellQuote = x.sc.toQuote(ss, p);
        if (buyStock > ss) {
            uint256 net = qb > sellQuote ? qb - sellQuote : 0;
            (, uint256 stockOut) = _poolLeg(x, true, net);
            uint256 supply = ss + stockOut;
            if (supply < buyStock) {
                x.num = supply;
                x.den = buyStock;
                x.buyersScaled = true;
            }
        } else if (ss > buyStock) {
            (, uint256 quoteOut) = _poolLeg(x, false, ss - buyStock);
            uint256 supply = qb + quoteOut;
            if (supply < sellQuote) {
                x.num = supply;
                x.den = sellQuote;
                x.sellersScaled = true;
            }
        }

        address lastStockOwner;
        address lastQuoteOwner;
        for (uint256 i; i < n; ++i) {
            if (cls[i] == 0) continue;
            Order storage o = q[i];
            (uint256 cs, uint256 cq) = _settleOrder(x, o, cls[i]);
            if (cs != 0) lastStockOwner = o.owner;
            if (cq != 0) lastQuoteOwner = o.owner;
            emit OrderSettled(PoolId.unwrap(x.id), session, i, o.owner, o.status, cs, cq);
        }
        openCount[x.id][session] = 0;

        // Liabilities: filled and refunded inputs leave the open set and become credits.
        address stockA = Currency.unwrap(x.stockC);
        address quoteA = Currency.unwrap(x.quoteC);
        liabilities[stockA] = liabilities[stockA] - x.openStock + x.creditStock;
        liabilities[quoteA] = liabilities[quoteA] - x.openQuote + x.creditQuote;

        (d0, d1) = _donateSurplus(x, lastStockOwner, lastQuoteOwner);
        return (x.volume, x.filled, d0, d1);
    }

    /// @dev Returns (stock credited, quote credited) for the order.
    function _settleOrder(CrossCtx memory x, Order storage o, uint8 cls) internal returns (uint256 cs, uint256 cq) {
        uint256 amt = o.amountIn;
        if (o.buy) x.openQuote += amt;
        else x.openStock += amt;

        if (cls == 3) {
            o.status = Status.Refunded;
            if (o.buy) cq = amt;
            else cs = amt;
        } else if (cls == 1) {
            uint256 used = x.buyersScaled ? _ceilMul(amt, x.num, x.den) : amt;
            if (used > amt) used = amt;
            cs = x.sc.toStock(used, x.p);
            cq = amt - used;
            x.volume += used;
            x.filled += 1;
            o.status = used == amt ? Status.Filled : Status.Partial;
        } else {
            uint256 used = x.sellersScaled ? _ceilMul(amt, x.num, x.den) : amt;
            if (used > amt) used = amt;
            cq = x.sc.toQuote(used, x.p);
            cs = amt - used;
            x.volume += cq;
            x.filled += 1;
            o.status = used == amt ? Status.Filled : Status.Partial;
        }
        x.creditStock += cs;
        x.creditQuote += cq;
        if (cs != 0) credits[o.owner][Currency.unwrap(x.stockC)] += cs;
        if (cq != 0) credits[o.owner][Currency.unwrap(x.quoteC)] += cq;
    }

    function _ceilMul(uint256 a, uint256 num, uint256 den) internal pure returns (uint256) {
        return (a * num + den - 1) / den;
    }

    /// @dev Swaps `amountIn` of the input currency against the pool, stopping at p*. The hook's own swaps skip
    /// its callbacks, and the pool's stored LP fee is zero, so the leg never costs more than p*.
    function _poolLeg(CrossCtx memory x, bool buyStock, uint256 amountIn) internal returns (uint256 used, uint256 out) {
        if (amountIn == 0) return (0, 0);
        bool zeroForOne = buyStock ? !x.sc.stockIs0 : x.sc.stockIs0;
        uint160 target = x.sc.sqrtFromPrice(x.p);
        (uint160 sqrtP,,,) = poolManager.getSlot0(x.id);
        if (zeroForOne ? sqrtP <= target : sqrtP >= target) return (0, 0);

        BalanceDelta d = poolManager.swap(x.key, SwapParams(zeroForOne, -int256(amountIn), target), "");
        int128 aIn = zeroForOne ? d.amount0() : d.amount1();
        int128 aOut = zeroForOne ? d.amount1() : d.amount0();
        used = uint256(uint128(-aIn));
        out = uint256(uint128(aOut));

        Currency inC = buyStock ? x.quoteC : x.stockC;
        Currency outC = buyStock ? x.stockC : x.quoteC;
        inC.settle(poolManager, address(this), used, true);
        outC.take(poolManager, address(this), out, true);
    }

    /// @dev Everything above liabilities is surplus: the gap between what fillers paid at p* and what the pool leg
    /// cost. A rounding deficit of a few wei is taken from the last credit instead of reverting the cross.
    function _donateSurplus(CrossCtx memory x, address lastStockOwner, address lastQuoteOwner)
        internal
        returns (uint256 d0, uint256 d1)
    {
        uint256 stockSurplus = _surplus(x.stockC, lastStockOwner);
        uint256 quoteSurplus = _surplus(x.quoteC, lastQuoteOwner);
        (uint256 a0, uint256 a1) = x.sc.stockIs0 ? (stockSurplus, quoteSurplus) : (quoteSurplus, stockSurplus);
        if (a0 == 0 && a1 == 0) return (0, 0);

        if (poolManager.getLiquidity(x.id) == 0) {
            // Nobody to donate to: park it with the owner.
            _creditSurplus(x.key.currency0, a0);
            _creditSurplus(x.key.currency1, a1);
            return (0, 0);
        }
        poolManager.donate(x.key, a0, a1, "");
        if (a0 != 0) x.key.currency0.settle(poolManager, address(this), a0, true);
        if (a1 != 0) x.key.currency1.settle(poolManager, address(this), a1, true);
        return (a0, a1);
    }

    function _creditSurplus(Currency c, uint256 amount) internal {
        if (amount == 0) return;
        credits[owner()][Currency.unwrap(c)] += amount;
        liabilities[Currency.unwrap(c)] += amount;
    }

    function _surplus(Currency c, address lastOwner) internal returns (uint256) {
        address a = Currency.unwrap(c);
        uint256 bal = poolManager.balanceOf(address(this), c.toId());
        uint256 liab = liabilities[a];
        if (bal >= liab) return bal - liab;
        uint256 deficit = liab - bal;
        // Only rounding dust may be absorbed.
        if (deficit > bal / 1e9 + 100 || credits[lastOwner][a] < deficit) revert CrossInsolvent();
        credits[lastOwner][a] -= deficit;
        liabilities[a] -= deficit;
        return 0;
    }

    // ---------------------------------------------------------------------------------------------
    // Withdraw
    // ---------------------------------------------------------------------------------------------

    /// @notice Pays out fills and refunds held for the caller.
    function withdraw(Currency currency, address to) external returns (uint256 amount) {
        address a = Currency.unwrap(currency);
        amount = credits[msg.sender][a];
        if (amount == 0) revert NothingToWithdraw();
        credits[msg.sender][a] = 0;
        liabilities[a] -= amount;
        poolManager.unlock(abi.encode(Action.Withdraw, abi.encode(currency, to, amount)));
        emit Withdrawn(msg.sender, a, to, amount);
    }

    // ---------------------------------------------------------------------------------------------
    // Prints
    // ---------------------------------------------------------------------------------------------

    function _recordPrint(
        PoolId id,
        PoolConfig storage pc,
        uint8 kind,
        uint64 sessionId,
        uint256 price,
        uint256 volume,
        uint32 orderCount
    ) internal {
        SessionPrint memory sp = SessionPrint({
            token: pc.cfg.stockToken,
            sessionId: sessionId,
            kind: kind,
            tokenPrice: price,
            multiplier: IERC8056(pc.cfg.stockToken).uiMultiplier(),
            crossVolume: volume,
            orderCount: orderCount,
            timestamp: uint64(block.timestamp)
        });
        _prints[id][sessionId][kind] = sp;
        emit SessionPrintRecorded(PoolId.unwrap(id), sessionId, kind, price, sp.multiplier, volume, orderCount);
        _broadcast(id, sp);
    }

    function _broadcast(PoolId id, SessionPrint memory sp) internal {
        address b = broadcaster;
        if (b == address(0)) return;
        try IPrintBroadcaster(b).broadcast{gas: 3_000_000}(sp) {}
        catch {
            emit PrintBroadcastFailed(PoolId.unwrap(id), sp.sessionId, sp.kind);
        }
    }

    /// @notice Permissionless retry for a print whose CCIP broadcast failed.
    function rebroadcast(PoolKey calldata key, uint64 sessionId, uint8 kind) external onlyValidPools(key.hooks) {
        PoolId id = key.toId();
        if (_prints[id][sessionId][kind].timestamp == 0) revert NotConfigured();
        IPrintBroadcaster(broadcaster).broadcast(_prints[id][sessionId][kind]);
    }

    // ---------------------------------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------------------------------

    function getState(PoolId id) external view returns (PoolState memory) {
        return _state[id];
    }

    function getConfig(PoolId id) external view returns (PoolConfig memory) {
        return _cfg[id];
    }

    function getOrders(PoolId id, uint64 sessionId) external view returns (Order[] memory) {
        return _orders[id][sessionId];
    }

    function getPrint(PoolId id, uint64 sessionId, uint8 kind) external view returns (SessionPrint memory) {
        return _prints[id][sessionId][kind];
    }
}
