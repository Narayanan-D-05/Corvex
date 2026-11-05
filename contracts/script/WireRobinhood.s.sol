// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console2} from "forge-std/Script.sol";

import {PrintBroadcaster} from "../src/ccip/PrintBroadcaster.sol";
import {ReopenReceiver} from "../src/ccip/ReopenReceiver.sol";

/// @notice Run on Robinhood Chain Testnet after DeploySource has run on Arbitrum and Base Sepolia: registers the
/// two oracles as print destinations, trusts the controller and gateways, and funds the broadcaster for CCIP fees.
///
/// Env: PRIVATE_KEY, ARB_SELECTOR, BASE_SELECTOR, optional BROADCASTER_FUND_WEI (default 0.05 ether).
contract WireRobinhood is Script {
    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        uint64 arbSel = uint64(vm.envUint("ARB_SELECTOR"));
        uint64 baseSel = uint64(vm.envUint("BASE_SELECTOR"));

        string memory rh = vm.readFile("./deployments/robinhood-testnet.json");
        string memory arb = vm.readFile("./deployments/arb-sepolia.json");
        string memory base = vm.readFile("./deployments/base-sepolia.json");

        PrintBroadcaster b = PrintBroadcaster(payable(vm.parseJsonAddress(rh, ".broadcaster")));
        ReopenReceiver r = ReopenReceiver(vm.parseJsonAddress(rh, ".receiver"));

        vm.startBroadcast(pk);
        b.addDestination(arbSel, vm.parseJsonAddress(arb, ".oracle"), 300_000);
        b.addDestination(baseSel, vm.parseJsonAddress(base, ".oracle"), 300_000);
        r.setScheduleSender(arbSel, vm.parseJsonAddress(arb, ".controller"));
        r.setOrderGateway(arbSel, vm.parseJsonAddress(arb, ".gateway"));
        r.setOrderGateway(baseSel, vm.parseJsonAddress(base, ".gateway"));
        uint256 fund = vm.envOr("BROADCASTER_FUND_WEI", uint256(0.05 ether));
        if (fund > 0) payable(address(b)).transfer(fund);
        vm.stopBroadcast();

        console2.log("destinations:", b.destinations().length);
    }
}
