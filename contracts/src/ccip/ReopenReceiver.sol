// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {CCIPReceiver} from "@chainlink/contracts-ccip/contracts/applications/CCIPReceiver.sol";
import {Client} from "@chainlink/contracts-ccip/contracts/libraries/Client.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId} from "@uniswap/v4-core/src/types/PoolId.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";

import {ReopenCrossHook} from "../ReopenCrossHook.sol";

uint8 constant MSG_SCHEDULE = 0;
uint8 constant MSG_ORDER = 1;

/// @notice Robinhood Chain side of the inbound CCIP flows. A schedule from the ReopenController moves a pool to
/// dark early; an order from an OrderGateway joins the queue. Business failures never revert the CCIP execution:
/// an order that cannot be queued becomes a refundable claim instead.
contract ReopenReceiver is CCIPReceiver, Ownable {
    using SafeERC20 for IERC20;

    ReopenCrossHook public immutable hook;

    mapping(uint64 selector => address) public scheduleSender; // ReopenController per source chain
    mapping(uint64 selector => address) public orderGateway; // OrderGateway per source chain
    mapping(bytes32 poolId => PoolKey) internal _keys;
    mapping(bytes32 poolId => bool) public registered;
    mapping(bytes32 poolId => uint64) public lastNonce;
    mapping(address user => mapping(address token => uint256)) public refunds;

    event PoolRegistered(bytes32 indexed poolId);
    event ScheduleForwarded(bytes32 indexed poolId, uint40 darkFrom, uint40 reopenAt, uint256 expectedMultiplier, uint64 nonce);
    event ScheduleRejected(bytes32 indexed poolId, uint64 nonce, bytes reason);
    event OrderForwarded(bytes32 indexed poolId, address indexed owner, uint256 amount, uint64 srcSelector, bytes32 messageId);
    event OrderRefundable(bytes32 indexed poolId, address indexed owner, address token, uint256 amount, bytes32 messageId);
    event RefundClaimed(address indexed user, address indexed token, address to, uint256 amount);

    error UntrustedSender(uint64 selector, address sender);
    error NothingToClaim();

    constructor(address router, address hook_, address owner_) CCIPReceiver(router) Ownable(owner_) {
        hook = ReopenCrossHook(hook_);
    }

    function registerPool(PoolKey calldata key) external onlyOwner {
        bytes32 id = PoolId.unwrap(_id(key));
        _keys[id] = key;
        registered[id] = true;
        emit PoolRegistered(id);
    }

    function setScheduleSender(uint64 selector, address sender) external onlyOwner {
        scheduleSender[selector] = sender;
    }

    function setOrderGateway(uint64 selector, address gateway) external onlyOwner {
        orderGateway[selector] = gateway;
    }

    function poolKey(bytes32 poolId) external view returns (PoolKey memory) {
        return _keys[poolId];
    }

    function _id(PoolKey calldata key) internal pure returns (PoolId) {
        return PoolId.wrap(keccak256(abi.encode(key)));
    }

    function _ccipReceive(Client.Any2EVMMessage memory m) internal override {
        address sender = abi.decode(m.sender, (address));
        uint8 kind = abi.decode(m.data, (uint8));

        if (kind == MSG_SCHEDULE) {
            if (scheduleSender[m.sourceChainSelector] != sender) revert UntrustedSender(m.sourceChainSelector, sender);
            _onSchedule(m.data);
        } else {
            if (orderGateway[m.sourceChainSelector] != sender) revert UntrustedSender(m.sourceChainSelector, sender);
            _onOrder(m);
        }
    }

    function _onSchedule(bytes memory data) internal {
        (, bytes32 poolId, uint40 darkFrom, uint40 reopenAt, uint256 expectedMultiplier, uint64 nonce) =
            abi.decode(data, (uint8, bytes32, uint40, uint40, uint256, uint64));
        if (nonce <= lastNonce[poolId]) {
            emit ScheduleRejected(poolId, nonce, "stale nonce");
            return;
        }
        lastNonce[poolId] = nonce;
        try hook.applySchedule(PoolId.wrap(poolId), darkFrom, reopenAt, expectedMultiplier) {
            emit ScheduleForwarded(poolId, darkFrom, reopenAt, expectedMultiplier, nonce);
        } catch (bytes memory reason) {
            emit ScheduleRejected(poolId, nonce, reason);
        }
    }

    function _onOrder(Client.Any2EVMMessage memory m) internal {
        (, bytes32 poolId, address owner_, uint256 limitPrice) = abi.decode(m.data, (uint8, bytes32, address, uint256));
        if (m.destTokenAmounts.length != 1) return; // nothing was delivered that we could account for
        address token = m.destTokenAmounts[0].token;
        uint256 amount = m.destTokenAmounts[0].amount;

        if (!registered[poolId] || token != _quoteOf(poolId)) {
            refunds[owner_][token] += amount;
            emit OrderRefundable(poolId, owner_, token, amount, m.messageId);
            return;
        }

        IERC20(token).forceApprove(address(hook), amount);
        try hook.queueExternal(_keys[poolId], owner_, amount, limitPrice, m.sourceChainSelector) {
            emit OrderForwarded(poolId, owner_, amount, m.sourceChainSelector, m.messageId);
        } catch {
            IERC20(token).forceApprove(address(hook), 0);
            refunds[owner_][token] += amount;
            emit OrderRefundable(poolId, owner_, token, amount, m.messageId);
        }
    }

    function _quoteOf(bytes32 poolId) internal view returns (address) {
        PoolKey storage k = _keys[poolId];
        bool stockIs0 = hook.getConfig(PoolId.wrap(poolId)).scale.stockIs0;
        return Currency.unwrap(stockIs0 ? k.currency1 : k.currency0);
    }

    /// @notice Pays out an order that could not be queued.
    function claimRefund(address token, address to) external {
        uint256 amount = refunds[msg.sender][token];
        if (amount == 0) revert NothingToClaim();
        refunds[msg.sender][token] = 0;
        IERC20(token).safeTransfer(to, amount);
        emit RefundClaimed(msg.sender, token, to, amount);
    }
}
