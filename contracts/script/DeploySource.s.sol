// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console2} from "forge-std/Script.sol";

import {SessionPrintOracle} from "../src/ccip/SessionPrintOracle.sol";
import {ReopenController} from "../src/ccip/ReopenController.sol";
import {OrderGateway} from "../src/ccip/OrderGateway.sol";
import {SessionLedger} from "../src/consumers/SessionLedger.sol";

/// @notice Arbitrum Sepolia or Base Sepolia: the print oracle, the order gateway and, on Arbitrum, the schedule
/// controller and the reference ledger.
///
/// Env: PRIVATE_KEY, ROLE ("arb" | "base"), CCIP_ROUTER, CRE_FORWARDER (MockKeystoneForwarder while simulating,
/// KeystoneForwarder when deployed), SELF_SELECTOR, RH_SELECTOR, RH_BROADCASTER, RH_RECEIVER.
/// Writes deployments/<ROLE>-sepolia.json.
contract DeploySource is Script {
    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address me = vm.addr(pk);
        string memory role = vm.envString("ROLE");
        bool isArb = keccak256(bytes(role)) == keccak256("arb");
        require(isArb || keccak256(bytes(role)) == keccak256("base"), "ROLE must be arb or base");

        address router = vm.envAddress("CCIP_ROUTER");
        address forwarder = vm.envAddress("CRE_FORWARDER");
        uint64 self = uint64(vm.envUint("SELF_SELECTOR"));
        uint64 rh = uint64(vm.envUint("RH_SELECTOR"));
        address broadcaster = vm.envAddress("RH_BROADCASTER");
        address rhReceiver = vm.envAddress("RH_RECEIVER");

        vm.startBroadcast(pk);

        SessionPrintOracle oracle = new SessionPrintOracle(router, forwarder, rh, broadcaster, self, me);
        OrderGateway gateway = new OrderGateway(router, rh, me);
        gateway.setReopenReceiver(rhReceiver);

        string memory o = "src";
        vm.serializeAddress(o, "oracle", address(oracle));
        vm.serializeAddress(o, "gateway", address(gateway));
        vm.serializeAddress(o, "router", router);
        vm.serializeAddress(o, "forwarder", forwarder);

        if (isArb) {
            ReopenController controller = new ReopenController(router, forwarder, self, rh, me);
            controller.setReopenReceiver(rhReceiver);
            uint256 fund = vm.envOr("CONTROLLER_FUND_WEI", uint256(0.01 ether));
            if (fund > 0) payable(address(controller)).transfer(fund);
            SessionLedger ledger = new SessionLedger(oracle);
            vm.serializeAddress(o, "controller", address(controller));
            vm.serializeAddress(o, "ledger", address(ledger));
            console2.log("controller", address(controller));
            console2.log("ledger", address(ledger));
        }
        string memory out = vm.serializeUint(o, "selector", self);

        vm.stopBroadcast();

        vm.writeJson(out, string.concat("./deployments/", role, "-sepolia.json"));
        console2.log("oracle", address(oracle));
        console2.log("gateway", address(gateway));
    }
}
