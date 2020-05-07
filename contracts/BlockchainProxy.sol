pragma solidity >=0.6.0 <0.7.0;

import "./Relay.sol";

contract BlockchainProxy {

    struct Call {
        address caller;
        address contractAddr;
        uint dappSpecificId;
        string callback;
        bytes msgData;
    }

    uint constant REQU_CONFIRMATIONS = 10;
    uint private nextCallId = 1;
    mapping(uint => Call) private pendingCalls;
    mapping(address => uint) private unsentCalls;
    Relay private relay;
    address private callAckContract;

    constructor(address _callAckContract) public {
        callAckContract = _callAckContract;
    }

    function contractCall(address contractAddr, uint dappSpecificId, string memory callback) public {
        require(unsentCalls[msg.sender] == 0);

        pendingCalls[nextCallId].contractAddr = contractAddr;
        pendingCalls[nextCallId].dappSpecificId = dappSpecificId;
        pendingCalls[nextCallId].callback = callback;
        pendingCalls[nextCallId].caller = msg.sender;
        unsentCalls[msg.sender] = nextCallId;

        return this;
    }

    function() external {
        require(unsentCalls[msg.sender] != 0);
        require(pendingCalls[unsentCalls[msg.sender]].msgData == 0);
        pendingCalls[unsentCalls[msg.sender]].msgData = msg.data;
        // parse msg.data (extract callId)
//        emit FunctionCall(msg.sender, pendingCalls[msg.sender], callId, msg.data);
        delete unsentCalls[msg.sender];
    }

    function submitCall(uint callId) external {
        require(pendingCalls[callId].msgData != 0);
        // TODO: emit receiver contract on destination blockchain
        emit FunctionCall(pendingCalls[callId].caller, pendingCalls[callId].contractAddr, pendingCalls[callId].msgData, );
    }

    function functionCall(bytes memory rlpHeader, uint8 noOfConfirmations, bytes memory rlpEncodedTx,
        bytes memory path, bytes memory rlpEncodedNodes) {
        require(block.gaslimit - gasleft() >= 1000000);  // ensure that enough gas is provided
        require(relay.verify(feeInWei, rlpHeader, REQU_CONFIRMATIONS, rlpEncodedTx, path, rlpEncodedNodes));
        (address destinationProxy, address contractAddr, bytes callData, uint callId) = parse(rlpEncodedTx);
        require(destinationProxy == address(this));

        (bool success, bytes memory data) = contractAddr.call(callData);
        emit FunctionCallCompleted(success, data, callId);
    }

}
