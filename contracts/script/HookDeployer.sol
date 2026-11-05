// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {HookMiner} from "@uniswap/v4-periphery/src/utils/HookMiner.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {ReopenCrossHook} from "../src/ReopenCrossHook.sol";

/// @notice Minimal CREATE2 factory. The shared deployer proxy is not guaranteed to exist on every chain, so
/// the scripts deploy this first and mine the hook address against it.
contract HookDeployer {
    event Deployed(address addr, bytes32 salt);

    function deploy(bytes32 salt, bytes memory initCode) external returns (address addr) {
        assembly {
            addr := create2(0, add(initCode, 0x20), mload(initCode), salt)
        }
        require(addr != address(0), "create2 failed");
        emit Deployed(addr, salt);
    }
}

library CorvexHookMiner {
    uint160 internal constant FLAGS = uint160(
        Hooks.BEFORE_INITIALIZE_FLAG | Hooks.BEFORE_SWAP_FLAG | Hooks.AFTER_SWAP_FLAG
            | Hooks.BEFORE_SWAP_RETURNS_DELTA_FLAG
    );

    function mine(address factory, IPoolManager pm, address owner_) internal view returns (address, bytes32, bytes memory) {
        bytes memory args = abi.encode(pm, owner_);
        (address predicted, bytes32 salt) = HookMiner.find(factory, FLAGS, type(ReopenCrossHook).creationCode, args);
        return (predicted, salt, abi.encodePacked(type(ReopenCrossHook).creationCode, args));
    }
}
