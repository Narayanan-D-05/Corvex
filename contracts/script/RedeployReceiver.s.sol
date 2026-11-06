// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console2} from "forge-std/Script.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {LPFeeLibrary} from "@uniswap/v4-core/src/libraries/LPFeeLibrary.sol";

import {ReopenCrossHook} from "../src/ReopenCrossHook.sol";
import {ReopenReceiver} from "../src/ccip/ReopenReceiver.sol";
import {OrderGateway} from "../src/ccip/OrderGateway.sol";
import {ReopenController} from "../src/ccip/ReopenController.sol";

/// @notice Swaps in a new ReopenReceiver without touching the hook, pool or oracles. Run in two steps:
///   ROLE=rh   on Robinhood Chain Testnet: deploys the receiver, points the hook at it, trusts the senders
///   ROLE=arb  on Arbitrum Sepolia: points the gateway and the schedule controller at it
///   ROLE=base on Base Sepolia: points the gateway at it
/// Env: PRIVATE_KEY, ROLE, RH_CCIP_ROUTER (rh), ARB_SELECTOR, BASE_SELECTOR (rh).
contract RedeployReceiver is Script {
    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address me = vm.addr(pk);
        string memory role = vm.envString("ROLE");
        string memory rhJson = vm.readFile("./deployments/robinhood-testnet.json");

        if (_is(role, "rh")) {
            string memory arb = vm.readFile("./deployments/arb-sepolia.json");
            string memory base = vm.readFile("./deployments/base-sepolia.json");
            ReopenCrossHook hook = ReopenCrossHook(vm.parseJsonAddress(rhJson, ".hook"));
            PoolKey memory key = PoolKey(
                Currency.wrap(vm.parseJsonAddress(rhJson, ".currency0")),
                Currency.wrap(vm.parseJsonAddress(rhJson, ".currency1")),
                LPFeeLibrary.DYNAMIC_FEE_FLAG,
                60,
                IHooks(address(hook))
            );
            vm.startBroadcast(pk);
            ReopenReceiver r = new ReopenReceiver(vm.envAddress("RH_CCIP_ROUTER"), address(hook), me);
            hook.setReceiver(address(r));
            r.registerPool(key);
            r.setScheduleSender(uint64(vm.envUint("ARB_SELECTOR")), vm.parseJsonAddress(arb, ".controller"));
            r.setOrderGateway(uint64(vm.envUint("ARB_SELECTOR")), vm.parseJsonAddress(arb, ".gateway"));
            r.setOrderGateway(uint64(vm.envUint("BASE_SELECTOR")), vm.parseJsonAddress(base, ".gateway"));
            vm.stopBroadcast();
            console2.log("new receiver", address(r));
        } else {
            address r = vm.parseJsonAddress(rhJson, ".receiver"); // rewritten by the caller after the rh step
            string memory f = _is(role, "arb") ? "./deployments/arb-sepolia.json" : "./deployments/base-sepolia.json";
            string memory src = vm.readFile(f);
            vm.startBroadcast(pk);
            OrderGateway(vm.parseJsonAddress(src, ".gateway")).setReopenReceiver(r);
            if (_is(role, "arb")) ReopenController(payable(vm.parseJsonAddress(src, ".controller"))).setReopenReceiver(r);
            vm.stopBroadcast();
            console2.log("pointed at", r);
        }
    }

    function _is(string memory a, string memory b) internal pure returns (bool) {
        return keccak256(bytes(a)) == keccak256(bytes(b));
    }
}
