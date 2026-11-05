// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @dev kind: 0 = close, 1 = open.
uint8 constant KIND_CLOSE = 0;
uint8 constant KIND_OPEN = 1;

/// @notice A split-safe price recorded by the hook at a session boundary.
struct SessionPrint {
    address token;
    uint64 sessionId;
    uint8 kind;
    uint256 tokenPrice; // quote per token, 18 dp, multiplier-adjusted
    uint256 multiplier; // uiMultiplier() at print time, 18 dp
    uint256 crossVolume; // quote-denominated volume filled in the cross; 0 for closes and empty crosses
    uint32 orderCount; // orders filled in the cross
    uint64 timestamp;
}
