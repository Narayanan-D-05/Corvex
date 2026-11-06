// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @notice Holds the hook credits of one cross-chain user on Robinhood Chain. The receiver creates one per
/// (source chain, user) so fills can be attributed and sent back to the right chain. It only acts for the receiver.
contract FillVault {
    address public immutable receiver;

    error OnlyReceiver();

    constructor(address receiver_) {
        receiver = receiver_;
    }

    function execute(address target, bytes calldata data) external returns (bytes memory ret) {
        if (msg.sender != receiver) revert OnlyReceiver();
        bool ok;
        (ok, ret) = target.call(data);
        if (!ok) {
            assembly ("memory-safe") {
                revert(add(ret, 32), mload(ret))
            }
        }
    }
}
