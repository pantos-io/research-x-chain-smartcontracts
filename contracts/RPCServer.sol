pragma solidity >=0.6.0 <0.7.0;

import "./Relay.sol";
import "./RPC.sol";

contract RPCServer {

    struct RelayMeta {
        address relayAddr;
        uint8 requiredConfirmations;
    }

    uint256 constant public MIN_CALL_GAS = 1000000;
    uint256 constant public MIN_CALL_GAS_CHECK = 1015874;

    mapping(address => RelayMeta) rpcProxyToRelay;

    event CallExecuted(address remoteRPCProxy, uint callId, bool success, bytes data);

    constructor(address[] memory proxies, address[] memory relayAddresses, uint8[] memory confirmations) public {
        require(proxies.length == relayAddresses.length, "arrays must have the same length (1)");
        require(relayAddresses.length == confirmations.length, "arrays must have the same length (2)");
        for (uint i = 0; i < proxies.length; i++) {
            rpcProxyToRelay[proxies[i]].relayAddr = relayAddresses[i];
            rpcProxyToRelay[proxies[i]].requiredConfirmations = confirmations[i];
        }
    }

    function executeCall(bytes calldata rlpHeader, bytes calldata rlpEncodedTx,
        bytes calldata path, bytes calldata rlpEncodedNodes) external {
        uint8 feeInWei = 0;  // TODO

        address remoteRPCProxy = parseRPCProxy(rlpEncodedTx);
        RelayMeta memory relayMeta = rpcProxyToRelay[remoteRPCProxy];
        require(relayMeta.relayAddr != address(0));
        require(Relay(relayMeta.relayAddr).verifyTransaction(feeInWei, rlpHeader, relayMeta.requiredConfirmations, rlpEncodedTx, path, rlpEncodedNodes) == 0);
//TODO: 
// RPCServer.sol:35:60: CompilerError: Stack too deep, try removing local variables.
//     uint8 verified = relay.verifyTransaction(feeInWei, rlpHeader, reqConfirmations, rlpEncodedTx, path, rlpEncodedNodes);
//                                                        ^-------^
// Creating RelayMeta instead of separate relayAddress and reqConfirmations solves this.

        (address intendedRPCServer, address contractAddr, bytes memory callData, uint callId) = parseTx(rlpEncodedTx);
        require(intendedRPCServer == address(this));

        require (gasleft() >= MIN_CALL_GAS_CHECK);
        (bool success, bytes memory data) = contractAddr.call{gas: MIN_CALL_GAS}(callData);
        emit CallExecuted(remoteRPCProxy, callId, success, data);
    }

    function parseRPCProxy(bytes memory rlpEncodedTx) private returns (address) {
//TODO
        return address(0);
    }

    function parseTx(bytes memory rlpEncodedTx) private returns (address, address, bytes memory, uint) {
//TODO
        return (address(0), address(0), new bytes(0), 0);
    }

}
