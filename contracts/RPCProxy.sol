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
    uint256 constant public MIN_CALL_GAS = 1000000;
    uint256 constant public MIN_CALL_GAS_CHECK = 1015874;
    //TODO make sure these numbers are solid

    uint256 private nextCallId = 1;
    mapping(uint => Call) private pendingCalls;
    mapping(address => uint) private preparedCalls;
    address private remoteRPCServer;
    Relay relay;

    event CallPrepared(uint callId);
    event CallSubmitted(uint callId);
    event CallRequested(uint callId, address caller, address remoteRPCServer, address contractAddr, bytes msgData);
    event CallAcknowledged(uint callId, bool success);

    constructor(address _remoteRPCServer, address _relayAddr) public {
        remoteRPCServer = _remoteRPCServer;
        relay = Relay(_relayAddr);
    }

    function callContract(address contractAddr, uint dappSpecificId, string memory callback, bytes memory msgData) public {
        require(preparedCalls[msg.sender] == 0);

        pendingCalls[nextCallId].contractAddr = contractAddr;
        pendingCalls[nextCallId].dappSpecificId = dappSpecificId;
        pendingCalls[nextCallId].callback = callback;
        pendingCalls[nextCallId].caller = msg.sender;
        pendingCalls[nextCallId].msgData = msg.data;
        emit CallPrepared(nextCallId);
        nextCallId++;
    }

    function requestCall(uint callId) external {
        require(pendingCalls[callId].msgData.length != 0);
        emit CallRequested(
            callId,
            pendingCalls[callId].caller,
            remoteRPCServer,
            pendingCalls[callId].contractAddr,
            pendingCalls[callId].msgData
        );
        delete pendingCalls[callId].msgData;
    }

    function acknowledgeCall(bytes calldata rlpHeader, bytes calldata rlpEncodedTx,
        bytes calldata path, bytes calldata rlpEncodedNodes) external {
        // we now only allow external calls with up to 1000000 gas consumption
        // calls returning failure are not distinguishable whether out-of-gas or programmatic failure
        // there is no other way to prevent off-chain clients from out-of-gas attacks
        // since solidity reserves 1/64 for post-processing after external calls this means
        // we need to ensure before the call that enough gas is left

        uint8 feeInWei = 0; //TODO
        require(relay.verifyTransaction(feeInWei, rlpHeader, reqConfirmations, rlpEncodedTx, path, rlpEncodedNodes) == 0);
        (uint callId, address txRemoteRPCServer, bytes memory result, uint error) = parseTx(rlpEncodedTx);
        require(remoteRPCServer == txRemoteRPCServer);
        require(pendingCalls[callId].caller != address(0));  // make sure pending call is not acknowledged yet

        string memory callbackSig = string(abi.encodePacked(pendingCalls[callId].callback, "(uint, bytes, uint)"));

        require (gasleft() >= MIN_CALL_GAS_CHECK);
        (bool success,) = pendingCalls[callId].caller.call{gas: MIN_CALL_GAS}(abi.encodeWithSignature(callbackSig, pendingCalls[callId].dappSpecificId, result, error));
        delete pendingCalls[callId];

        emit CallAcknowledged(callId, success);
    }

    function parseTx(bytes memory rlpEncodedTx) private returns (uint, address, bytes memory, uint) {
        // TODO: implement me
        return (0, address(0), new bytes(0), 0);
    }

}
