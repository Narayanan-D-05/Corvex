// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IRouterClient} from "@chainlink/contracts-ccip/contracts/interfaces/IRouterClient.sol";
import {Client} from "@chainlink/contracts-ccip/contracts/libraries/Client.sol";
import {SessionPrint} from "../types/SessionPrint.sol";

/// @notice Sends each Session Print from Robinhood Chain to every registered SessionPrintOracle. Holds the native
/// balance that pays the CCIP fees. One destination failing never blocks the others.
contract PrintBroadcaster is Ownable {
    struct Dest {
        uint64 selector;
        address oracle;
        uint32 gasLimit;
    }

    IRouterClient public immutable router;
    address public immutable hook;
    Dest[] internal _dests;

    event PrintSent(uint64 indexed selector, bytes32 indexed messageId, address token, uint64 sessionId, uint8 kind);
    event PrintSendFailed(uint64 indexed selector, address token, uint64 sessionId, uint8 kind, bytes reason);
    event DestinationAdded(uint64 selector, address oracle, uint32 gasLimit);
    event DestinationsCleared();

    error OnlyHook();

    constructor(address router_, address hook_, address owner_) Ownable(owner_) {
        router = IRouterClient(router_);
        hook = hook_;
    }

    function addDestination(uint64 selector, address oracle, uint32 gasLimit) external onlyOwner {
        _dests.push(Dest(selector, oracle, gasLimit));
        emit DestinationAdded(selector, oracle, gasLimit);
    }

    function clearDestinations() external onlyOwner {
        delete _dests;
        emit DestinationsCleared();
    }

    function destinations() external view returns (Dest[] memory) {
        return _dests;
    }

    function quote(SessionPrint calldata p) external view returns (uint256 total) {
        bytes memory data = abi.encode(p);
        for (uint256 i; i < _dests.length; ++i) {
            total += router.getFee(_dests[i].selector, _message(_dests[i], data));
        }
    }

    function broadcast(SessionPrint calldata p) external {
        if (msg.sender != hook) revert OnlyHook();
        bytes memory data = abi.encode(p);
        for (uint256 i; i < _dests.length; ++i) {
            Dest memory d = _dests[i];
            Client.EVM2AnyMessage memory m = _message(d, data);
            try router.getFee(d.selector, m) returns (uint256 fee) {
                try router.ccipSend{value: fee}(d.selector, m) returns (bytes32 id) {
                    emit PrintSent(d.selector, id, p.token, p.sessionId, p.kind);
                } catch (bytes memory reason) {
                    emit PrintSendFailed(d.selector, p.token, p.sessionId, p.kind, reason);
                }
            } catch (bytes memory reason) {
                emit PrintSendFailed(d.selector, p.token, p.sessionId, p.kind, reason);
            }
        }
    }

    function _message(Dest memory d, bytes memory data) internal pure returns (Client.EVM2AnyMessage memory) {
        return Client.EVM2AnyMessage({
            receiver: abi.encode(d.oracle),
            data: data,
            tokenAmounts: new Client.EVMTokenAmount[](0),
            extraArgs: Client._argsToBytes(
                Client.GenericExtraArgsV2({gasLimit: d.gasLimit, allowOutOfOrderExecution: true})
            ),
            feeToken: address(0) // native
        });
    }

    function withdraw(address payable to, uint256 amount) external onlyOwner {
        (bool ok,) = to.call{value: amount}("");
        require(ok, "withdraw failed");
    }

    receive() external payable {}
}
