// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {SessionPrint} from "../types/SessionPrint.sol";

interface IPrintBroadcaster {
    function broadcast(SessionPrint calldata p) external;
}
