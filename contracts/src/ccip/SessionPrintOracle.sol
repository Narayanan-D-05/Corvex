// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {CCIPReceiver} from "@chainlink/contracts-ccip/contracts/applications/CCIPReceiver.sol";
import {Client} from "@chainlink/contracts-ccip/contracts/libraries/Client.sol";
import {ReceiverTemplate} from "../cre/ReceiverTemplate.sol";
import {SessionPrint} from "../types/SessionPrint.sol";

/// @notice Destination-chain store for Session Prints. CCIP delivers a print as Recorded; a CRE report then marks
/// it Attested or Disputed. Consumers read only attested prints.
contract SessionPrintOracle is CCIPReceiver, ReceiverTemplate {
    enum Status {
        None,
        Recorded,
        Attested,
        Disputed
    }

    struct Entry {
        SessionPrint print;
        Status status;
        int32 deviationBps;
    }

    uint64 public immutable sourceSelector; // Robinhood Chain
    address public immutable broadcaster;
    uint64 public immutable selfSelector; // this chain, for CRE replay protection

    mapping(bytes32 => Entry) internal _entries;

    event PrintReceived(
        bytes32 indexed key,
        address indexed token,
        uint64 sessionId,
        uint8 kind,
        uint256 tokenPrice,
        uint256 multiplier,
        uint64 timestamp
    );
    event PrintJudged(bytes32 indexed key, bool attested, int32 deviationBps);

    error WrongSource(uint64 selector);
    error WrongSender(address sender);
    error Duplicate(bytes32 key);
    error WrongChain(uint64 selector);
    error NotRecorded(bytes32 key);
    error NotAttested(bytes32 key);

    constructor(
        address router,
        address forwarder_,
        uint64 sourceSelector_,
        address broadcaster_,
        uint64 selfSelector_,
        address owner_
    ) CCIPReceiver(router) ReceiverTemplate(forwarder_, owner_) {
        sourceSelector = sourceSelector_;
        broadcaster = broadcaster_;
        selfSelector = selfSelector_;
    }

    function keyOf(address token, uint64 sessionId, uint8 kind) public pure returns (bytes32) {
        return keccak256(abi.encode(token, sessionId, kind));
    }

    // CCIP: a print arrives from Robinhood Chain
    function _ccipReceive(Client.Any2EVMMessage memory m) internal override {
        if (m.sourceChainSelector != sourceSelector) revert WrongSource(m.sourceChainSelector);
        address sender = abi.decode(m.sender, (address));
        if (sender != broadcaster) revert WrongSender(sender);

        SessionPrint memory p = abi.decode(m.data, (SessionPrint));
        bytes32 key = keyOf(p.token, p.sessionId, p.kind);
        if (_entries[key].status != Status.None) revert Duplicate(key);
        _entries[key].print = p;
        _entries[key].status = Status.Recorded;
        emit PrintReceived(key, p.token, p.sessionId, p.kind, p.tokenPrice, p.multiplier, p.timestamp);
    }

    // CRE: a verdict on a recorded print. Report = (bytes32 key, bool attested, int32 deviationBps, uint64 chainSelector)
    function _processReport(bytes calldata report) internal override {
        (bytes32 key, bool ok, int32 devBps, uint64 chainSel) = abi.decode(report, (bytes32, bool, int32, uint64));
        if (chainSel != selfSelector) revert WrongChain(chainSel);
        Entry storage e = _entries[key];
        if (e.status != Status.Recorded) revert NotRecorded(key);
        e.status = ok ? Status.Attested : Status.Disputed;
        e.deviationBps = devBps;
        emit PrintJudged(key, ok, devBps);
    }

    function getEntry(bytes32 key) external view returns (Entry memory) {
        return _entries[key];
    }

    function statusOf(address token, uint64 sessionId, uint8 kind) external view returns (Status) {
        return _entries[keyOf(token, sessionId, kind)].status;
    }

    /// @notice Reverts unless the print is attested.
    function getAttestedPrint(address token, uint64 sessionId, uint8 kind)
        external
        view
        returns (SessionPrint memory)
    {
        bytes32 key = keyOf(token, sessionId, kind);
        if (_entries[key].status != Status.Attested) revert NotAttested(key);
        return _entries[key].print;
    }

    function supportsInterface(bytes4 id) public pure override(CCIPReceiver, ReceiverTemplate) returns (bool) {
        return CCIPReceiver.supportsInterface(id) || ReceiverTemplate.supportsInterface(id);
    }
}
