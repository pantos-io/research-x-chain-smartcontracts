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

    uint8 constant public reqConfirmations = 5;
    uint private nextCallId = 1;
    mapping(uint => Call) private pendingCalls;
    mapping(address => uint) private preparedCalls;
    address private remoteRPCServer;
    Relay relay;

    event CallPrepared(uint callId);
    event CallSubmitted(uint callId);
    event FunctionCall(uint callId, address caller, address remoteRPCServer, address contractAddr, bytes msgData);
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

//        return this;
        // TODO
    }

    fallback() external {
        require(preparedCalls[msg.sender] != 0);
        require(pendingCalls[preparedCalls[msg.sender]].msgData.length == 0);
        pendingCalls[preparedCalls[msg.sender]].msgData = msg.data;
        emit CallPrepared(preparedCalls[msg.sender]);
        delete preparedCalls[msg.sender];
    }

    function submitCall(uint callId) external {
        require(pendingCalls[callId].msgData.length != 0);
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
        require(relay.verifyTransaction(feeInWei, rlpHeader, reqConfirmations, rlpEncodedTx, path, rlpEncodedNodes) == 0);
        (uint callId, address txRemoteRPCServer, bytes memory result, uint error) = parseTx(rlpEncodedTx);
        require(remoteRPCServer == txRemoteRPCServer);
        require(pendingCalls[callId].caller != address(0));  // make sure pending call is not acknowledged yet

        bytes memory callbackSig = append(bytes(pendingCalls[callId].callback), "(uint,bytes,uint)");
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

    function parseTx(bytes memory rlpEncodedTx) private returns (uint, address, bytes memory, uint) {
        // TODO: implement me
        return (0, address(0), new bytes[](0), 0);
    }

}
