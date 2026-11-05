// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {SessionPrintOracle} from "../ccip/SessionPrintOracle.sol";
import {SessionPrint, KIND_CLOSE, KIND_OPEN} from "../types/SessionPrint.sol";

/// @notice Reference consumer of attested prints. Books the overnight move (open minus the prior close) and the
/// session move (close minus the open) per token. Sums are in token terms (quote per token, 18 dp): the token price
/// is continuous through splits, so a split day never books a fake overnight loss.
contract SessionLedger {
    SessionPrintOracle public immutable oracle;

    mapping(address token => int256) public overnightSum;
    mapping(address token => int256) public sessionSum;
    mapping(address token => mapping(uint64 sessionId => bool)) public overnightBooked;
    mapping(address token => mapping(uint64 sessionId => bool)) public sessionBooked;

    event OvernightBooked(address indexed token, uint64 indexed sessionId, int256 move);
    event SessionBooked(address indexed token, uint64 indexed sessionId, int256 move);

    error AlreadyBooked();
    error NoPriorSession();

    constructor(SessionPrintOracle oracle_) {
        oracle = oracle_;
    }

    /// @notice open(sessionId) - close(sessionId - 1). Reverts unless both prints are attested.
    function bookOvernight(address token, uint64 sessionId) external returns (int256 move) {
        if (sessionId == 0) revert NoPriorSession();
        if (overnightBooked[token][sessionId]) revert AlreadyBooked();
        SessionPrint memory open = oracle.getAttestedPrint(token, sessionId, KIND_OPEN);
        SessionPrint memory prevClose = oracle.getAttestedPrint(token, sessionId - 1, KIND_CLOSE);
        move = int256(open.tokenPrice) - int256(prevClose.tokenPrice);
        overnightBooked[token][sessionId] = true;
        overnightSum[token] += move;
        emit OvernightBooked(token, sessionId, move);
    }

    /// @notice close(sessionId) - open(sessionId). Reverts unless both prints are attested.
    function bookSession(address token, uint64 sessionId) external returns (int256 move) {
        if (sessionBooked[token][sessionId]) revert AlreadyBooked();
        SessionPrint memory open = oracle.getAttestedPrint(token, sessionId, KIND_OPEN);
        SessionPrint memory close = oracle.getAttestedPrint(token, sessionId, KIND_CLOSE);
        move = int256(close.tokenPrice) - int256(open.tokenPrice);
        sessionBooked[token][sessionId] = true;
        sessionSum[token] += move;
        emit SessionBooked(token, sessionId, move);
    }

    /// @notice Converts a token-terms amount to per-share at a given multiplier (18 dp).
    function perShare(int256 tokenAmount, uint256 multiplier) external pure returns (int256) {
        return tokenAmount * 1e18 / int256(multiplier);
    }
}
