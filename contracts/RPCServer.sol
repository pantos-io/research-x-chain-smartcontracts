pragma solidity >=0.6.0 <0.7.0;

import "./Relay.sol";
import "./RPC.sol";

contract RPCServer {

    struct RelayMeta {
        address relayAddr;
        uint requiredConfirmation;
    }

    mapping(address => RelayMeta) rpcProxyToRelay;

    event CallExecuted(address remoteRPCProxy, uint callId, bool success, byte data);

    constructor(mapping(address => RelayMeta) memory _rpcProxyToRelay) public {
        rpcProxyToRelay = _rpcProxyToRelay;
    }

    function executeCall(bytes calldata rlpHeader, uint8 noOfConfirmations, bytes calldata rlpEncodedTx,
        bytes calldata path, bytes calldata rlpEncodedNodes) external {
        require(block.gaslimit - gasleft() >= 1000000);  // ensure that enough gas is provided
        uint feeInWei = 0;  // TODO

        address remoteRPCProxy = parseProxy(rlpEncodedTx);
        require(rpcProxyToRelay[remoteRPCProxy].relayAddr != 0);
        Relay relay = Relay(rpcProxyToRelay[remoteRPCProxy].relayAddr);
        uint reqConfirmations = rpcProxyToRelay[remoteRPCProxy].requiredConfirmations;
        require(relay.verify(feeInWei, rlpHeader, reqConfirmations, rlpEncodedTx, path, rlpEncodedNodes));

        (address intendedRPCServer, address contractAddr, bytes callData, uint callId, address remoteRPCProxy) = parse(rlpEncodedTx);
        require(intendedRPCServer == address(this));

        (bool success, bytes memory data) = contractAddr.call(callData);
        emit CallExecuted(remoteRPCProxy, callId, success, data);
    }

}
