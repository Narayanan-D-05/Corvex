// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";

interface IReceiver is IERC165 {
    function onReport(bytes calldata metadata, bytes calldata report) external;
}

/// @notice Base for contracts that consume CRE reports. Only the configured forwarder can deliver a report, and
/// the report can optionally be pinned to one workflow owner.
abstract contract ReceiverTemplate is IReceiver, Ownable {
    address public forwarder; // MockKeystoneForwarder when simulating, KeystoneForwarder when deployed
    address public expectedWorkflowOwner; // 0 = any owner

    event ForwarderSet(address forwarder);
    event WorkflowOwnerSet(address owner);

    error UnauthorizedForwarder(address caller);
    error UnexpectedWorkflowOwner(address got);

    constructor(address forwarder_, address owner_) Ownable(owner_) {
        forwarder = forwarder_;
    }

    function setForwarder(address f) external onlyOwner {
        forwarder = f;
        emit ForwarderSet(f);
    }

    function setExpectedWorkflowOwner(address o) external onlyOwner {
        expectedWorkflowOwner = o;
        emit WorkflowOwnerSet(o);
    }

    function onReport(bytes calldata metadata, bytes calldata report) external virtual override {
        if (msg.sender != forwarder) revert UnauthorizedForwarder(msg.sender);
        address want = expectedWorkflowOwner;
        if (want != address(0)) {
            // metadata = workflowId (32) | workflowName (10) | workflowOwner (20) | reportName (2)
            address got = address(bytes20(metadata[42:62]));
            if (got != want) revert UnexpectedWorkflowOwner(got);
        }
        _processReport(report);
    }

    function _processReport(bytes calldata report) internal virtual;

    function supportsInterface(bytes4 id) public pure virtual override returns (bool) {
        return id == type(IReceiver).interfaceId || id == type(IERC165).interfaceId;
    }
}
