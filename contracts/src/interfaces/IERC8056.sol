// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @notice The two views of a Robinhood stock token that the hook reads.
interface IERC8056 {
    function oraclePaused() external view returns (bool);
    function uiMultiplier() external view returns (uint256);
}
