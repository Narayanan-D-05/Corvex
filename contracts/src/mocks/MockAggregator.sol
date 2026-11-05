// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {AggregatorV3Interface} from "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";

contract MockAggregator is AggregatorV3Interface {
    uint8 public immutable override decimals;
    int256 public answer;
    uint256 public updatedAt;
    uint80 public round;

    constructor(uint8 d, int256 initial) {
        decimals = d;
        _set(initial, block.timestamp);
    }

    function _set(int256 a, uint256 t) internal {
        answer = a;
        updatedAt = t;
        round += 1;
    }

    function setAnswer(int256 a) external {
        _set(a, block.timestamp);
    }

    function setAnswerAt(int256 a, uint256 t) external {
        _set(a, t);
    }

    function description() external pure override returns (string memory) {
        return "mock";
    }

    function version() external pure override returns (uint256) {
        return 1;
    }

    function getRoundData(uint80) external view override returns (uint80, int256, uint256, uint256, uint80) {
        return (round, answer, updatedAt, updatedAt, round);
    }

    function latestRoundData() external view override returns (uint80, int256, uint256, uint256, uint80) {
        return (round, answer, updatedAt, updatedAt, round);
    }
}
