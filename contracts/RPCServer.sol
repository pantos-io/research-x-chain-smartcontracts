pragma solidity >=0.6.0 <0.7.0;

import "./Relay.sol";
import "./RPC.sol";

contract RPCServer {

    struct RelayMeta {
        address relayAddr;
        uint requiredConfirmations;
    }

    mapping(address => RelayMeta) rpcProxyToRelay;

    event CallExecuted(address remoteRPCProxy, uint callId, bool success, byte data);

    constructor(address[] memory proxies, address[] memory relayAddresses, uint[] memory confirmations) public {
        require(proxies.length == relayAddresses.length, "arrays must have the same length (1)");
        require(relayAddresses.length == confirmations.length, "arrays must have the same length (2)");
        for (uint i = 0; i < proxies.length; i++) {
            rpcProxyToRelay[proxies[i]].relayAddr = relayAddresses[i];
            rpcProxyToRelay[proxies[i]].requiredConfirmations = confirmations[i];
        }
    }

    function executeCall(bytes calldata rlpHeader, uint8 noOfConfirmations, bytes calldata rlpEncodedTx,
        bytes calldata path, bytes calldata rlpEncodedNodes) external {
        require(block.gaslimit - gasleft() >= 1000000);  // ensure that enough gas is provided
        uint feeInWei = 0;  // TODO

        address remoteRPCProxy = parseRPCProxy(rlpEncodedTx);
        require(rpcProxyToRelay[remoteRPCProxy].relayAddr != 0);
        Relay relay = Relay(rpcProxyToRelay[remoteRPCProxy].relayAddr);
        uint reqConfirmations = rpcProxyToRelay[remoteRPCProxy].requiredConfirmations;
        require(relay.verify(feeInWei, rlpHeader, reqConfirmations, rlpEncodedTx, path, rlpEncodedNodes));

        (address intendedRPCServer, address contractAddr, bytes memory callData, uint callId) = parseTx(rlpEncodedTx);
        require(intendedRPCServer == address(this));

        (bool success, bytes memory data) = contractAddr.call(callData);
        emit CallExecuted(remoteRPCProxy, callId, success, data);
    }

    function parseRPCProxy(bytes memory rlpEncodedTx) private returns (address) {
        return 0;
    }

    function parseTx(bytes memory rlpEncodedTx) private returns (address, address, bytes memory, uint) {
        return (0, 0, 0, 0);
    }

}
