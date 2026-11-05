// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {CorvexBase} from "./CorvexBase.sol";
import {ReopenCrossHook} from "../src/ReopenCrossHook.sol";
import {PrintBroadcaster} from "../src/ccip/PrintBroadcaster.sol";
import {SessionPrintOracle} from "../src/ccip/SessionPrintOracle.sol";
import {ReopenController} from "../src/ccip/ReopenController.sol";
import {ReopenReceiver} from "../src/ccip/ReopenReceiver.sol";
import {OrderGateway} from "../src/ccip/OrderGateway.sol";
import {ReceiverTemplate} from "../src/cre/ReceiverTemplate.sol";
import {SessionLedger} from "../src/consumers/SessionLedger.sol";
import {MockCCIPRouter} from "../src/mocks/MockCCIPRouter.sol";
import {SessionPrint, KIND_CLOSE, KIND_OPEN} from "../src/types/SessionPrint.sol";
import {Client} from "@chainlink/contracts-ccip/contracts/libraries/Client.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {PoolId} from "@uniswap/v4-core/src/types/PoolId.sol";

contract CcipTest is CorvexBase {
    uint64 constant RH = 2032988798112970440;
    uint64 constant ARB = 3478487238524512106;
    uint64 constant BASE = 10344971235874465080;

    MockCCIPRouter router;
    PrintBroadcaster broadcaster;
    SessionPrintOracle oracleArb;
    SessionPrintOracle oracleBase;
    ReopenController controller;
    ReopenReceiver rcv;
    OrderGateway gatewayBase;
    OrderGateway gatewayArb;
    SessionLedger ledger;

    address forwarder = makeAddr("forwarder");

    function setUp() public override {
        super.setUp();
        router = new MockCCIPRouter();
        router.setSupported(RH, true);
        router.setSupported(ARB, true);
        router.setSupported(BASE, true);

        broadcaster = new PrintBroadcaster(address(router), address(hook), address(this));
        router.setHome(address(broadcaster), RH);
        oracleArb = new SessionPrintOracle(address(router), forwarder, RH, address(broadcaster), ARB, address(this));
        oracleBase = new SessionPrintOracle(address(router), forwarder, RH, address(broadcaster), BASE, address(this));
        broadcaster.addDestination(ARB, address(oracleArb), 300_000);
        broadcaster.addDestination(BASE, address(oracleBase), 300_000);
        vm.deal(address(broadcaster), 10 ether);
        hook.setBroadcaster(address(broadcaster));

        rcv = new ReopenReceiver(address(router), address(hook), address(this));
        router.setHome(address(rcv), RH);
        hook.setReceiver(address(rcv));
        rcv.registerPool(key);

        controller = new ReopenController(address(router), forwarder, ARB, RH, address(this));
        controller.setReopenReceiver(address(rcv));
        router.setHome(address(controller), ARB);
        vm.deal(address(controller), 10 ether);
        rcv.setScheduleSender(ARB, address(controller));

        gatewayBase = new OrderGateway(address(router), RH, address(this));
        gatewayBase.setReopenReceiver(address(rcv));
        router.setHome(address(gatewayBase), BASE);
        rcv.setOrderGateway(BASE, address(gatewayBase));
        gatewayArb = new OrderGateway(address(router), RH, address(this));
        gatewayArb.setReopenReceiver(address(rcv));
        router.setHome(address(gatewayArb), ARB);
        rcv.setOrderGateway(ARB, address(gatewayArb));

        ledger = new SessionLedger(oracleArb);

        vm.deal(alice, 10 ether);
        vm.deal(bob, 10 ether);
        vm.startPrank(alice);
        usdg.approve(address(gatewayBase), type(uint256).max);
        usdg.approve(address(gatewayArb), type(uint256).max);
        vm.stopPrank();
    }

    // ---- helpers --------------------------------------------------------------------------------

    function _report(bytes32 k, bool ok, int32 dev, uint64 chain) internal pure returns (bytes memory) {
        return abi.encode(k, ok, dev, chain);
    }

    function _metadata(address wfOwner) internal pure returns (bytes memory) {
        return abi.encodePacked(bytes32(uint256(1)), bytes10("corvex"), wfOwner, bytes2(0));
    }

    function _judge(SessionPrintOracle o, uint64 chain, uint64 session, uint8 kind, bool ok, int32 dev) internal {
        bytes32 k = o.keyOf(address(stock), session, kind);
        vm.prank(forwarder);
        o.onReport(_metadata(address(this)), _report(k, ok, dev, chain));
    }

    function _fullSession() internal {
        _closeMarket(); // close(0) at 200
        _swapIn(alice, true, _q(5000), 215e18); // queued order
        _openMarketAt(T0 + 3 days, 212e8);
        hook.executeCross(key); // open(1) at 212
    }

    // ---- print broadcast ------------------------------------------------------------------------

    function test_closingPrintReachesBothChains() public {
        _closeMarket();
        for (uint256 i; i < 2; ++i) {
            SessionPrintOracle o = i == 0 ? oracleArb : oracleBase;
            SessionPrintOracle.Entry memory e = o.getEntry(o.keyOf(address(stock), 0, KIND_CLOSE));
            assertEq(uint8(e.status), uint8(SessionPrintOracle.Status.Recorded));
            assertEq(e.print.tokenPrice, 200e18);
            assertEq(e.print.multiplier, 1e18);
        }
        assertEq(router.failureCount(), 0);
    }

    function test_openingPrintReachesBothChains() public {
        _fullSession();
        for (uint256 i; i < 2; ++i) {
            SessionPrintOracle o = i == 0 ? oracleArb : oracleBase;
            SessionPrintOracle.Entry memory e = o.getEntry(o.keyOf(address(stock), 1, KIND_OPEN));
            assertEq(uint8(e.status), uint8(SessionPrintOracle.Status.Recorded));
            assertEq(e.print.tokenPrice, 212e18);
            assertEq(e.print.orderCount, 1, "alice's queued buy filled");
            assertGt(e.print.crossVolume, 0);
        }
    }

    function test_unattestedPrintCannotBeRead() public {
        _fullSession();
        vm.expectRevert();
        oracleArb.getAttestedPrint(address(stock), 1, KIND_OPEN);
    }

    function test_attestedPrintsFeedTheLedger() public {
        _fullSession();
        vm.expectRevert();
        ledger.bookOvernight(address(stock), 1);

        _judge(oracleArb, ARB, 0, KIND_CLOSE, true, 3);
        _judge(oracleArb, ARB, 1, KIND_OPEN, true, -4);
        assertEq(ledger.bookOvernight(address(stock), 1), 12e18, "overnight = open 212 - prior close 200");
        assertEq(ledger.overnightSum(address(stock)), 12e18);

        vm.expectRevert(SessionLedger.AlreadyBooked.selector);
        ledger.bookOvernight(address(stock), 1);
    }

    function test_disputedPrintIsNeverBooked() public {
        _fullSession();
        _judge(oracleArb, ARB, 0, KIND_CLOSE, true, 0);
        _judge(oracleArb, ARB, 1, KIND_OPEN, false, 900);
        vm.expectRevert();
        ledger.bookOvernight(address(stock), 1);
        assertEq(uint8(oracleArb.statusOf(address(stock), 1, KIND_OPEN)), uint8(SessionPrintOracle.Status.Disputed));
    }

    function test_splitDayOvernightIsContinuous() public {
        _closeMarket();
        vm.warp(T0 + 3 days);
        market.setOpen(true);
        stock.setUiMultiplier(2e18);
        feed.setAnswer(212e8);
        hook.executeCross(key);
        _judge(oracleArb, ARB, 0, KIND_CLOSE, true, 0);
        _judge(oracleArb, ARB, 1, KIND_OPEN, true, 0);
        // token terms: +12, not the -94 a per-share reading (106 vs 200) would book
        assertEq(ledger.bookOvernight(address(stock), 1), 12e18);
        assertEq(ledger.perShare(12e18, 2e18), 6e18);
    }

    function test_sessionMove() public {
        _fullSession();
        _closeMarket(); // close(1)
        feed.setAnswer(215e8);
        // the second close uses the last checked price: refresh it through a poke while open
        _judge(oracleArb, ARB, 1, KIND_OPEN, true, 0);
        assertEq(oracleArb.statusOf(address(stock), 1, KIND_CLOSE) == SessionPrintOracle.Status.Recorded, true);
        _judge(oracleArb, ARB, 1, KIND_CLOSE, true, 0);
        int256 move = ledger.bookSession(address(stock), 1);
        assertEq(move, int256(hook.getPrint(pid, 1, KIND_CLOSE).tokenPrice) - 212e18);
    }

    // ---- CRE report checks ----------------------------------------------------------------------

    function test_reportOnlyFromForwarder() public {
        _closeMarket();
        bytes32 k = oracleArb.keyOf(address(stock), 0, KIND_CLOSE);
        vm.expectRevert(abi.encodeWithSelector(ReceiverTemplate.UnauthorizedForwarder.selector, address(this)));
        oracleArb.onReport(_metadata(address(this)), _report(k, true, 0, ARB));
    }

    function test_reportReplayAndWrongChainRejected() public {
        _closeMarket();
        bytes32 k = oracleArb.keyOf(address(stock), 0, KIND_CLOSE);
        vm.prank(forwarder);
        vm.expectRevert(abi.encodeWithSelector(SessionPrintOracle.WrongChain.selector, BASE));
        oracleArb.onReport(_metadata(address(this)), _report(k, true, 0, BASE)); // a report meant for Base

        _judge(oracleArb, ARB, 0, KIND_CLOSE, true, 0);
        vm.prank(forwarder);
        vm.expectRevert(abi.encodeWithSelector(SessionPrintOracle.NotRecorded.selector, k));
        oracleArb.onReport(_metadata(address(this)), _report(k, false, 0, ARB)); // cannot judge twice
    }

    function test_workflowOwnerPinning() public {
        _closeMarket();
        oracleArb.setExpectedWorkflowOwner(address(0xBEEF));
        bytes32 k = oracleArb.keyOf(address(stock), 0, KIND_CLOSE);
        vm.prank(forwarder);
        vm.expectRevert(abi.encodeWithSelector(ReceiverTemplate.UnexpectedWorkflowOwner.selector, address(this)));
        oracleArb.onReport(_metadata(address(this)), _report(k, true, 0, ARB));
        vm.prank(forwarder);
        oracleArb.onReport(_metadata(address(0xBEEF)), _report(k, true, 0, ARB));
    }

    // ---- inbound CCIP checks --------------------------------------------------------------------

    function _spoofedPrint(uint64 source, address sender, uint64 session) internal returns (bytes memory reason) {
        SessionPrint memory p = SessionPrint(address(stock), session, KIND_OPEN, 999e18, 1e18, 0, 0, uint64(block.timestamp));
        Client.Any2EVMMessage memory m = Client.Any2EVMMessage({
            messageId: bytes32(uint256(7)),
            sourceChainSelector: source,
            sender: abi.encode(sender),
            data: abi.encode(p),
            destTokenAmounts: new Client.EVMTokenAmount[](0)
        });
        vm.prank(address(router));
        try oracleArb.ccipReceive(m) {} catch (bytes memory r) {
            reason = r;
        }
    }

    function test_oracleRejectsUnknownSourceSenderAndDuplicates() public {
        assertEq(bytes4(_spoofedPrint(BASE, address(broadcaster), 5)), SessionPrintOracle.WrongSource.selector);
        assertEq(bytes4(_spoofedPrint(RH, address(0xBAD), 5)), SessionPrintOracle.WrongSender.selector);
        assertEq(_spoofedPrint(RH, address(broadcaster), 5).length, 0, "valid message accepted");
        assertEq(bytes4(_spoofedPrint(RH, address(broadcaster), 5)), SessionPrintOracle.Duplicate.selector);
    }

    function test_nonRouterCannotDeliver() public {
        Client.Any2EVMMessage memory m;
        vm.expectRevert();
        oracleArb.ccipReceive(m);
    }

    // ---- broadcast resilience -------------------------------------------------------------------

    function test_broadcastFailureNeverBlocksTheHook() public {
        vm.prank(address(this));
        broadcaster.withdraw(payable(address(0xdead)), address(broadcaster).balance); // no fee funds
        _closeMarket();
        assertEq(uint8(_mode()), uint8(ReopenCrossHook.Mode.Dark));
        assertEq(hook.getPrint(pid, 0, KIND_CLOSE).tokenPrice, 200e18, "print still recorded");
        assertEq(uint8(oracleArb.statusOf(address(stock), 0, KIND_CLOSE)), uint8(SessionPrintOracle.Status.None));

        vm.deal(address(broadcaster), 1 ether);
        hook.rebroadcast(key, 0, KIND_CLOSE);
        assertEq(uint8(oracleArb.statusOf(address(stock), 0, KIND_CLOSE)), uint8(SessionPrintOracle.Status.Recorded));
    }

    function test_oneBadDestinationDoesNotBlockTheOther() public {
        router.setSupported(BASE, false);
        _closeMarket();
        assertEq(uint8(oracleArb.statusOf(address(stock), 0, KIND_CLOSE)), uint8(SessionPrintOracle.Status.Recorded));
        assertEq(uint8(oracleBase.statusOf(address(stock), 0, KIND_CLOSE)), uint8(SessionPrintOracle.Status.None));
    }

    function test_onlyHookCanBroadcast() public {
        SessionPrint memory p;
        vm.expectRevert(PrintBroadcaster.OnlyHook.selector);
        broadcaster.broadcast(p);
    }

    // ---- schedule -------------------------------------------------------------------------------

    function _scheduleReport(uint64 chain, uint40 from, uint40 to, uint256 mult, uint64 nonce)
        internal
        view
        returns (bytes memory)
    {
        return abi.encode(chain, PoolId.unwrap(pid), from, to, mult, nonce);
    }

    function test_scheduleTravelsFromControllerToHook() public {
        vm.prank(forwarder);
        controller.onReport(_metadata(address(this)), _scheduleReport(ARB, uint40(T0 + 1 hours), uint40(T0 + 3 days), 2e18, 1));

        ReopenCrossHook.PoolState memory s = _state();
        assertEq(s.darkFrom, T0 + 1 hours);
        assertEq(s.reopenAt, T0 + 3 days);
        assertEq(s.expectedMultiplier, 2e18);
        assertEq(router.failureCount(), 0);

        vm.warp(T0 + 2 hours);
        feed.setAnswer(200e8);
        hook.poke(key);
        assertEq(uint8(_mode()), uint8(ReopenCrossHook.Mode.Dark), "early dark from the schedule");
    }

    function test_controllerRejectsReplayAndWrongChain() public {
        bytes memory r = _scheduleReport(ARB, uint40(T0 + 1 hours), uint40(T0 + 3 days), 0, 1);
        vm.startPrank(forwarder);
        controller.onReport(_metadata(address(this)), r);
        vm.expectRevert(abi.encodeWithSelector(ReopenController.StaleNonce.selector, uint64(1), uint64(1)));
        controller.onReport(_metadata(address(this)), r);
        vm.expectRevert(abi.encodeWithSelector(ReopenController.WrongChain.selector, BASE));
        controller.onReport(_metadata(address(this)), _scheduleReport(BASE, uint40(T0 + 1 hours), uint40(T0 + 3 days), 0, 2));
        vm.stopPrank();
    }

    function test_receiverIgnoresUntrustedScheduleSender() public {
        Client.Any2EVMMessage memory m = Client.Any2EVMMessage({
            messageId: bytes32(uint256(1)),
            sourceChainSelector: ARB,
            sender: abi.encode(address(0xBAD)),
            data: abi.encode(uint8(0), PoolId.unwrap(pid), uint40(T0 + 1), uint40(T0 + 3 days), uint256(0), uint64(1)),
            destTokenAmounts: new Client.EVMTokenAmount[](0)
        });
        vm.prank(address(router));
        vm.expectRevert(abi.encodeWithSelector(ReopenReceiver.UntrustedSender.selector, ARB, address(0xBAD)));
        rcv.ccipReceive(m);
    }

    function test_badScheduleIsRejectedWithoutRevertingTheMessage() public {
        vm.prank(forwarder);
        controller.onReport(_metadata(address(this)), _scheduleReport(ARB, uint40(T0 + 20 days), uint40(T0 + 40 days), 0, 1));
        assertEq(router.failureCount(), 0, "message executed, schedule rejected");
        assertEq(_state().reopenAt, 0);
    }

    // ---- cross-chain orders ---------------------------------------------------------------------

    function _placeOrder(OrderGateway g, address from, address recipient, uint256 amount, uint256 limit) internal {
        uint256 fee = g.quote(PoolId.unwrap(pid), recipient, address(usdg), amount, limit);
        vm.prank(from);
        g.placeOrder{value: fee}(PoolId.unwrap(pid), recipient, address(usdg), amount, limit);
    }

    function test_crossChainOrderQueuesAndFills() public {
        _closeMarket();
        _placeOrder(gatewayBase, alice, bob, _q(8000), 220e18);

        ReopenCrossHook.Order[] memory o = hook.getOrders(pid, 1);
        assertEq(o.length, 1);
        assertEq(o[0].owner, bob, "recipient owns the order on Robinhood Chain");
        assertEq(o[0].srcSelector, BASE);
        assertEq(o[0].amountIn, _q(8000));
        assertEq(hook.liabilities(address(usdg)), _q(8000));

        _openMarketAt(T0 + 3 days, 212e8);
        hook.executeCross(key);
        assertGt(_credit(bob, true), 0, "fill held as a claim for the recipient");

        uint256 before = _balance(address(stock), bob);
        vm.prank(bob);
        hook.withdraw(Currency.wrap(address(stock)), bob);
        assertGt(_balance(address(stock), bob), before);
    }

    function test_orderRefundableWhenPoolNotDark() public {
        _placeOrder(gatewayArb, alice, bob, _q(1000), 0); // still Normal
        assertEq(rcv.refunds(bob, address(usdg)), _q(1000));
        assertEq(hook.getOrders(pid, 0).length, 0);

        uint256 before = _balance(address(usdg), bob);
        vm.prank(bob);
        rcv.claimRefund(address(usdg), bob);
        assertEq(_balance(address(usdg), bob) - before, _q(1000));
        assertEq(rcv.refunds(bob, address(usdg)), 0);
    }

    function test_orderRefundableWhenQueueFull() public {
        _closeMarket();
        for (uint256 i; i < 50; ++i) _swapIn(carol, true, _q(5000), 0);
        _placeOrder(gatewayBase, alice, bob, _q(1000), 0);
        assertEq(rcv.refunds(bob, address(usdg)), _q(1000));
        assertEq(hook.openCount(pid, 1), 50);
    }

    function test_orderFromUntrustedSenderRejected() public {
        Client.EVMTokenAmount[] memory t = new Client.EVMTokenAmount[](1);
        t[0] = Client.EVMTokenAmount(address(usdg), 1);
        Client.Any2EVMMessage memory m = Client.Any2EVMMessage({
            messageId: bytes32(uint256(1)),
            sourceChainSelector: BASE,
            sender: abi.encode(address(0xBAD)),
            data: abi.encode(uint8(1), PoolId.unwrap(pid), bob, uint256(0)),
            destTokenAmounts: t
        });
        vm.prank(address(router));
        vm.expectRevert(abi.encodeWithSelector(ReopenReceiver.UntrustedSender.selector, BASE, address(0xBAD)));
        rcv.ccipReceive(m);
    }

    function test_gatewayRefundsExcessFeeAndRequiresFee() public {
        uint256 fee = gatewayBase.quote(PoolId.unwrap(pid), bob, address(usdg), _q(10), 0);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(OrderGateway.FeeTooLow.selector, fee - 1, fee));
        gatewayBase.placeOrder{value: fee - 1}(PoolId.unwrap(pid), bob, address(usdg), _q(10), 0);

        uint256 eth0 = alice.balance;
        vm.prank(alice);
        gatewayBase.placeOrder{value: fee + 1 ether}(PoolId.unwrap(pid), bob, address(usdg), _q(10), 0);
        assertEq(eth0 - alice.balance, fee);
    }

    function test_onlyReceiverCanQueueExternal() public {
        _closeMarket();
        vm.expectRevert(ReopenCrossHook.OnlyReceiver.selector);
        hook.queueExternal(key, bob, _q(100), 0, BASE);
    }
}
