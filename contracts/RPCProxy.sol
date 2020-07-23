pragma solidity >=0.6.0 <0.7.0;
pragma experimental ABIEncoderV2;

import "./Relay.sol";
import "./RLPReader.sol";

contract RPCProxy {

    using RLPReader for RLPReader.RLPItem;
    using RLPReader for bytes;

    struct Call {
        address caller;
        address contractAddress;
        uint dappSpecificId;
        string callback;
        bytes callData;
    }

    struct CallAcknowledgement {
        bytes rlpHeader;
        bytes path;
        bytes rlpEncodedTx;
        bytes rlpEncodedTxNodes;
        bytes rlpEncodedReceipt;
        bytes rlpEncodedReceiptNodes;
    }

    struct Result {
        address rpcServer;
    }

    uint8 constant public reqConfirmations = 5;
    uint256 constant public MIN_CALL_GAS = 1000000;
    uint256 constant public MIN_CALL_GAS_CHECK = 1015874;
    // TODO: make sure these numbers are solid

    uint256 public nextCallId = 1;
    mapping(uint => Call) private pendingCalls;
    address private rpcServer;
    Relay relay;

    event CallPrepared(uint indexed callId);
    event CallRequested(uint indexed callId, address indexed caller, address indexed remoteContract, bytes callData);
    event CallAcknowledged(uint indexed callId, bool success);

    constructor(address _rpcServer, address _relayAddr) public {
        rpcServer = _rpcServer;
        relay = Relay(_relayAddr);
    }

    function callContract(address contractAddress, uint dappSpecificId, bytes memory callData, string memory callback) public {
        pendingCalls[nextCallId].contractAddress = contractAddress;
        pendingCalls[nextCallId].dappSpecificId = dappSpecificId;
        pendingCalls[nextCallId].callback = callback;
        pendingCalls[nextCallId].caller = msg.sender;
        pendingCalls[nextCallId].callData = callData;
        emit CallPrepared(nextCallId);
        nextCallId++;
    }

    function requestCall(uint callId) external {
        require(pendingCalls[callId].callData.length != 0, 'non-existent call');
        emit CallRequested(
            callId,
            pendingCalls[callId].caller,
            pendingCalls[callId].contractAddress,
            pendingCalls[callId].callData
        );
        // remove callData to prevent the call from being requested multiple times
        delete pendingCalls[callId].callData;
    }

    function acknowledgeCall(CallAcknowledgement calldata callAck) external {
        // we now only allow external calls with up to 1000000 gas consumption
        // calls returning failure are not distinguishable whether out-of-gas or programmatic failure
        // there is no other way to prevent off-chain clients from out-of-gas attacks
        // since solidity reserves 1/64 for post-processing after external calls this means
        // we need to ensure before the call that enough gas is left

        Result memory result = extractResult(callAck.rlpEncodedTx, callAck.rlpEncodedReceipt);
        require(result.rpcServer == rpcServer, 'illegal rpc server');

        uint8 feeInWei = 0; // todo: pass in constructor? Should ideally be dynamic
        uint8 requiredConfirmations = 0; // todo: should be passed in constructor --> potentially different for each relay
        uint8 verificationResult = relay.verifyTransaction(
            feeInWei,
            callAck.rlpHeader,
            requiredConfirmations,
            callAck.rlpEncodedTx,
            callAck.path,
            callAck.rlpEncodedTxNodes
        );
        require(verificationResult == 0, 'non-existent call execution');
        verificationResult = relay.verifyReceipt(
            feeInWei,
            callAck.rlpHeader,
            requiredConfirmations,
            callAck.rlpEncodedReceipt,
            callAck.path,
            callAck.rlpEncodedReceiptNodes
        );
        require(verificationResult == 0, 'non-existent call execution');

//        require(relay.verifyTransaction(feeInWei, rlpHeader, reqConfirmations, rlpEncodedTx, path, rlpEncodedNodes) == 0);
//        (uint callId, address txRemoteRPCServer, bytes memory result, uint error) = parseTx(rlpEncodedTx);
//        require(remoteRPCServer == txRemoteRPCServer);
//        require(pendingCalls[callId].caller != address(0));  // make sure pending call is not acknowledged yet
//
//        string memory callbackSig = string(abi.encodePacked(pendingCalls[callId].callback, "(uint, bytes, uint)"));
//
//        require (gasleft() >= MIN_CALL_GAS_CHECK);
//        (bool success,) = pendingCalls[callId].caller.call{gas: MIN_CALL_GAS}(abi.encodeWithSignature(callbackSig, pendingCalls[callId].dappSpecificId, result, error));
//        delete pendingCalls[callId];
//
//        emit CallAcknowledged(callId, success);
    }

    function getPendingCall(uint callId) public view returns (Call memory) {
        return pendingCalls[callId];
    }

    function extractResult(bytes memory rlpTransaction, bytes memory rlpReceipt) private returns (Result memory) {
        Result memory result;

        // parse transaction
        RLPReader.RLPItem[] memory transaction = rlpTransaction.toRlpItem().toList();
        result.rpcServer = transaction[3].toAddress();
        return result;
    }

}
