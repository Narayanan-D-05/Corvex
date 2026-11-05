// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IMarketStatus} from "./interfaces/IMarketStatus.sol";

/// @notice Exchange session status read by the hook. The keeper role stands in for a Data Streams market-status
/// adapter: whoever holds it reports each open and close.
contract MarketStatus is IMarketStatus, Ownable {
    bool public override isOpen;
    uint256 public override closeCount;
    mapping(address => bool) public keepers;

    event StatusChanged(bool open, uint256 closeCount);

    error NotKeeper();

    constructor(address owner_, bool open_) Ownable(owner_) {
        isOpen = open_;
        keepers[owner_] = true;
    }

    function setKeeper(address k, bool on) external onlyOwner {
        keepers[k] = on;
    }

    function setOpen(bool open_) external {
        if (!keepers[msg.sender]) revert NotKeeper();
        if (isOpen == open_) return;
        isOpen = open_;
        if (!open_) closeCount += 1;
        emit StatusChanged(open_, closeCount);
    }
}
