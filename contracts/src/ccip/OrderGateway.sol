// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IRouterClient} from "@chainlink/contracts-ccip/contracts/interfaces/IRouterClient.sol";
import {Client} from "@chainlink/contracts-ccip/contracts/libraries/Client.sol";

/// @notice Base or Arbitrum Sepolia entry point: one transaction sends USD and a buy order to Robinhood Chain.
contract OrderGateway is Ownable {
    using SafeERC20 for IERC20;

    IRouterClient public immutable router;
    uint64 public immutable destSelector; // Robinhood Chain

    address public reopenReceiver;
    uint32 public gasLimit = 800_000; // the receiver queues the order and may custody refunds

    event OrderSent(
        bytes32 indexed messageId, address indexed sender, address recipient, bytes32 poolId, address token, uint256 amount, uint256 limitPrice
    );
    event ReceiverSet(address receiver);

    error ReceiverNotSet();
    error FeeTooLow(uint256 sent, uint256 fee);
    error ZeroAmount();

    constructor(address router_, uint64 destSelector_, address owner_) Ownable(owner_) {
        router = IRouterClient(router_);
        destSelector = destSelector_;
    }

    function setReopenReceiver(address r) external onlyOwner {
        reopenReceiver = r;
        emit ReceiverSet(r);
    }

    function setGasLimit(uint32 g) external onlyOwner {
        gasLimit = g;
    }

    function quote(bytes32 poolId, address recipient, address token, uint256 amount, uint256 limitPrice)
        external
        view
        returns (uint256)
    {
        return router.getFee(destSelector, _message(poolId, recipient, token, amount, limitPrice));
    }

    /// @param recipient who owns the order, and its fills, on Robinhood Chain
    /// @param limitPrice max price in quote per token (18 dp); 0 = no limit
    function placeOrder(bytes32 poolId, address recipient, address token, uint256 amount, uint256 limitPrice)
        external
        payable
        returns (bytes32 id)
    {
        if (reopenReceiver == address(0)) revert ReceiverNotSet();
        if (amount == 0) revert ZeroAmount();

        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        IERC20(token).forceApprove(address(router), amount);

        Client.EVM2AnyMessage memory m = _message(poolId, recipient, token, amount, limitPrice);
        uint256 fee = router.getFee(destSelector, m);
        if (msg.value < fee) revert FeeTooLow(msg.value, fee);
        id = router.ccipSend{value: fee}(destSelector, m);

        if (msg.value > fee) {
            (bool ok,) = msg.sender.call{value: msg.value - fee}("");
            require(ok, "refund failed");
        }
        emit OrderSent(id, msg.sender, recipient, poolId, token, amount, limitPrice);
    }

    function _message(bytes32 poolId, address recipient, address token, uint256 amount, uint256 limitPrice)
        internal
        view
        returns (Client.EVM2AnyMessage memory)
    {
        Client.EVMTokenAmount[] memory t = new Client.EVMTokenAmount[](1);
        t[0] = Client.EVMTokenAmount({token: token, amount: amount});
        return Client.EVM2AnyMessage({
            receiver: abi.encode(reopenReceiver),
            data: abi.encode(uint8(1), poolId, recipient, limitPrice),
            tokenAmounts: t,
            extraArgs: Client._argsToBytes(
                Client.GenericExtraArgsV2({gasLimit: gasLimit, allowOutOfOrderExecution: true})
            ),
            feeToken: address(0)
        });
    }
}
