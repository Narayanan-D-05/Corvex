// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC8056} from "../interfaces/IERC8056.sol";

/// @notice Test and testnet stand-in for a Robinhood stock token (ERC-8056 views).
contract MockStockToken is ERC20, IERC8056 {
    uint8 private immutable _dec;
    bool public override oraclePaused;
    uint256 public override uiMultiplier = 1e18;

    constructor(string memory n, string memory s, uint8 d) ERC20(n, s) {
        _dec = d;
    }

    function decimals() public view override returns (uint8) {
        return _dec;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function setOraclePaused(bool p) external {
        oraclePaused = p;
    }

    function setUiMultiplier(uint256 m) external {
        uiMultiplier = m;
    }
}
