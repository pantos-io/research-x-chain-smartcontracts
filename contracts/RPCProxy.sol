pragma solidity >=0.6.0 <0.7.0;

import "./Relay.sol";

contract RPCProxy {

    struct Call {
        address caller;
        address contractAddr;
        uint dappSpecificId;
        string callback;
        bytes msgData;
    }

    uint private nextCallId = 1;
    mapping(uint => Call) private pendingCalls;
    mapping(address => uint) private preparedCalls;
    address private remoteRPCServer;
    Relay relay;

    event CallPrepared(uint callId);
    event CallSubmitted(uint callId);
    event CallAcknowledged(uint callId, bool success);

    constructor(address _remoteRPCServer, address _relayAddr) public {
        remoteRPCServer = _remoteRPCServer;
        relay = Relay(_relayAddr);
    }

    function contractCall(address contractAddr, uint dappSpecificId, string memory callback) public {
        require(preparedCalls[msg.sender] == 0);

        pendingCalls[nextCallId].contractAddr = contractAddr;
        pendingCalls[nextCallId].dappSpecificId = dappSpecificId;
        pendingCalls[nextCallId].callback = callback;
        pendingCalls[nextCallId].caller = msg.sender;
        preparedCalls[msg.sender] = nextCallId;

        return this;
    }

    function() external {
        require(preparedCalls[msg.sender] != 0);
        require(pendingCalls[preparedCalls[msg.sender]].msgData == 0);
        pendingCalls[preparedCalls[msg.sender]].msgData = msg.data;
        emit CallPrepared(preparedCalls[msg.sender]);
        delete preparedCalls[msg.sender];
    }

    function submitCall(uint callId) external {
        require(pendingCalls[callId].msgData != 0);
        emit FunctionCall(
            callId,
            pendingCalls[callId].caller,
            remoteRPCServer,
            pendingCalls[callId].contractAddr,
            pendingCalls[callId].msgData
        );
        delete pendingCalls[callId].msgData;
    }

    function acknowledgeCall(bytes calldata rlpHeader, uint8 noOfConfirmations, bytes calldata rlpEncodedTx,
        bytes calldata path, bytes calldata rlpEncodedNodes) external {
        require(block.gaslimit - gasleft() >= 1000000);  // TODO: ensure that enough gas is provided??
        uint feeInWei = 0;  // TODO
        require(relay.verify(feeInWei, rlpHeader, reqConfirmations, rlpEncodedTx, path, rlpEncodedNodes));
        (uint callId, address txRemoteRPCServer, bytes result, uint error) = parse(rlpEncodedTx);
        require(remoteRPCServer == txRemoteRPCServer);
        require(pendingCalls[callId].caller != 0);  // make sure pending call is not acknowledged yet

        bytes memory callbackSig = append(pendingCalls[callId].callback, "(uint,bytes,uint)");
        bytes4 callbackId = bytes4(keccak256(callbackSig));
        (bool success,) = pendingCalls[callId].caller.call(callbackId, pendingCalls[callId].dappSpecificId, result, error);
        delete pendingCalls[callId];

        emit CallAcknowledged(callId, success);
    }

    function append(bytes memory arr1, bytes memory arr2) private returns (bytes memory) {
        bytes memory result = new bytes(arr1.length + arr2.length);
        uint idx = 0;

        for (uint i = 0; i < arr1.length; i++) {
            result[idx] = arr1[i];
            idx++;
        }
        for (uint i = 0; i < arr2.length; i++) {
            result[idx] = arr2[i];
            idx++;
        }

        return result;
    }

}
