// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IRouterClient} from "@chainlink/contracts-ccip/contracts/interfaces/IRouterClient.sol";
import {Client} from "@chainlink/contracts-ccip/contracts/libraries/Client.sol";
import {ReceiverTemplate} from "../cre/ReceiverTemplate.sol";

/// @notice Arbitrum Sepolia side of the schedule flow. The CRE `session-attestor` workflow writes a report here;
/// the controller forwards it over CCIP to the ReopenReceiver on Robinhood Chain.
contract ReopenController is ReceiverTemplate {
    IRouterClient public immutable router;
    uint64 public immutable selfSelector; // this chain, for CRE replay protection
    uint64 public immutable destSelector; // Robinhood Chain

    address public reopenReceiver;
    uint32 public gasLimit = 300_000;
    mapping(bytes32 poolId => uint64) public lastNonce;
    /// @notice keccak256(abi.encode(darkFrom, reopenAt, expectedMultiplier)) of the last schedule sent, so the
    /// workflow can skip a schedule that was already delivered.
    mapping(bytes32 poolId => bytes32) public scheduleHash;

    event ScheduleSent(bytes32 indexed poolId, bytes32 indexed messageId, uint40 darkFrom, uint40 reopenAt, uint256 expectedMultiplier, uint64 nonce);
    event ReceiverSet(address receiver);

    error WrongChain(uint64 selector);
    error StaleNonce(uint64 nonce, uint64 last);
    error ReceiverNotSet();

    constructor(address router_, address forwarder_, uint64 selfSelector_, uint64 destSelector_, address owner_)
        ReceiverTemplate(forwarder_, owner_)
    {
        router = IRouterClient(router_);
        selfSelector = selfSelector_;
        destSelector = destSelector_;
    }

    function setReopenReceiver(address r) external onlyOwner {
        reopenReceiver = r;
        emit ReceiverSet(r);
    }

    function setGasLimit(uint32 g) external onlyOwner {
        gasLimit = g;
    }

    /// @dev report = (uint64 chainSelector, bytes32 poolId, uint40 darkFrom, uint40 reopenAt,
    ///                uint256 expectedMultiplier, uint64 nonce)
    function _processReport(bytes calldata report) internal override {
        (uint64 chainSel, bytes32 poolId, uint40 darkFrom, uint40 reopenAt, uint256 mult, uint64 nonce) =
            abi.decode(report, (uint64, bytes32, uint40, uint40, uint256, uint64));
        if (chainSel != selfSelector) revert WrongChain(chainSel);
        if (nonce <= lastNonce[poolId]) revert StaleNonce(nonce, lastNonce[poolId]);
        if (reopenReceiver == address(0)) revert ReceiverNotSet();
        lastNonce[poolId] = nonce;
        scheduleHash[poolId] = keccak256(abi.encode(darkFrom, reopenAt, mult));

        Client.EVM2AnyMessage memory m = _message(abi.encode(uint8(0), poolId, darkFrom, reopenAt, mult, nonce));
        uint256 fee = router.getFee(destSelector, m);
        bytes32 id = router.ccipSend{value: fee}(destSelector, m);
        emit ScheduleSent(poolId, id, darkFrom, reopenAt, mult, nonce);
    }

    function _message(bytes memory data) internal view returns (Client.EVM2AnyMessage memory) {
        return Client.EVM2AnyMessage({
            receiver: abi.encode(reopenReceiver),
            data: data,
            tokenAmounts: new Client.EVMTokenAmount[](0),
            extraArgs: Client._argsToBytes(
                Client.GenericExtraArgsV2({gasLimit: gasLimit, allowOutOfOrderExecution: true})
            ),
            feeToken: address(0)
        });
    }

    function withdraw(address payable to, uint256 amount) external onlyOwner {
        (bool ok,) = to.call{value: amount}("");
        require(ok, "withdraw failed");
    }

    receive() external payable {}
}
