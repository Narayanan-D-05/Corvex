// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IRouterClient} from "@chainlink/contracts-ccip/contracts/interfaces/IRouterClient.sol";
import {IAny2EVMMessageReceiver} from "@chainlink/contracts-ccip/contracts/interfaces/IAny2EVMMessageReceiver.sol";
import {Client} from "@chainlink/contracts-ccip/contracts/libraries/Client.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @notice Local stand-in for a CCIP router. One instance plays every chain: a sender's home selector is
/// registered up front, and a message is delivered to its receiver in the same transaction. Receiver reverts are
/// captured (as on a real lane, the message then waits for manual execution) instead of failing the send.
contract MockCCIPRouter is IRouterClient {
    uint256 public feePerMessage = 0.001 ether;
    uint256 public nonce;
    mapping(address sender => uint64) public homeSelector;
    mapping(uint64 selector => bool) public supported;

    struct Failed {
        bytes32 messageId;
        bytes reason;
    }

    Failed[] public failures;

    event MessageSent(bytes32 indexed messageId, uint64 indexed destSelector, address indexed sender, address receiver);
    event ExecutionFailed(bytes32 indexed messageId, bytes reason);

    function setHome(address sender, uint64 selector) external {
        homeSelector[sender] = selector;
    }

    function setSupported(uint64 selector, bool on) external {
        supported[selector] = on;
    }

    function setFee(uint256 f) external {
        feePerMessage = f;
    }

    function failureCount() external view returns (uint256) {
        return failures.length;
    }

    function isChainSupported(uint64 selector) external view returns (bool) {
        return supported[selector];
    }

    function getFee(uint64 dest, Client.EVM2AnyMessage memory) external view returns (uint256) {
        if (!supported[dest]) revert UnsupportedDestinationChain(dest);
        return feePerMessage;
    }

    function ccipSend(uint64 dest, Client.EVM2AnyMessage calldata m) external payable returns (bytes32 id) {
        if (!supported[dest]) revert UnsupportedDestinationChain(dest);
        if (msg.value < feePerMessage) revert InsufficientFeeTokenAmount();

        address receiver = abi.decode(m.receiver, (address));
        id = keccak256(abi.encode(address(this), ++nonce, msg.sender, dest));

        Client.EVMTokenAmount[] memory delivered = new Client.EVMTokenAmount[](m.tokenAmounts.length);
        for (uint256 i; i < m.tokenAmounts.length; ++i) {
            IERC20(m.tokenAmounts[i].token).transferFrom(msg.sender, receiver, m.tokenAmounts[i].amount);
            delivered[i] = m.tokenAmounts[i];
        }

        emit MessageSent(id, dest, msg.sender, receiver);
        Client.Any2EVMMessage memory a = Client.Any2EVMMessage({
            messageId: id,
            sourceChainSelector: homeSelector[msg.sender],
            sender: abi.encode(msg.sender),
            data: m.data,
            destTokenAmounts: delivered
        });
        if (receiver.code.length == 0) return id; // a plain wallet just receives the tokens
        try IAny2EVMMessageReceiver(receiver).ccipReceive(a) {}
        catch (bytes memory reason) {
            failures.push(Failed(id, reason));
            emit ExecutionFailed(id, reason);
        }
    }
}
