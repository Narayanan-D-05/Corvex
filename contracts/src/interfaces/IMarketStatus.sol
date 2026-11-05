// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @notice Exchange session status. closeCount() rises every time the market closes, so a close
/// that nobody observed (no swap, no poke) is still detected.
interface IMarketStatus {
    function isOpen() external view returns (bool);
    function closeCount() external view returns (uint256);
}
