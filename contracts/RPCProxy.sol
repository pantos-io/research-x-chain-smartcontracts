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
        bool status;
        uint callId;
        address rpcProxy;
        bool success;
        bytes returnData;
    }

    uint8 constant public reqConfirmations = 5;
    uint256 constant public MIN_CALL_GAS = 1000000;
    uint256 constant public MIN_CALL_GAS_CHECK = 1015874;
    // TODO: make sure these numbers are solid

    uint256 public nextCallId = 1;
    mapping(uint => Call) private pendingCalls;
    mapping(bytes32 => bool) private acknowledgedCalls;
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
        require(result.status == true, 'failed call execution');

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

        require(result.rpcProxy == address(this), "incorrect rpc proxy");
        require(gasleft() >= MIN_CALL_GAS_CHECK, 'not enough gas');

        // make sure pending call is not acknowledged yet
        require(acknowledgedCalls[keccak256(callAck.rlpEncodedTx)] == false, 'multiple call acknowledgement');
        acknowledgedCalls[keccak256(callAck.rlpEncodedTx)] = true;

        string memory callbackSig = string(abi.encodePacked(pendingCalls[result.callId].callback, "(uint256,bytes,bool)"));
        (bool success,) = pendingCalls[result.callId].caller.call{gas: MIN_CALL_GAS}(abi.encodeWithSignature(callbackSig, pendingCalls[result.callId].dappSpecificId, result.returnData, result.success));

        delete pendingCalls[result.callId];
        emit CallAcknowledged(result.callId, success);
    }

    function getPendingCall(uint callId) public view returns (Call memory) {
        return pendingCalls[callId];
    }

    function extractResult(bytes memory rlpTransaction, bytes memory rlpReceipt) private returns (Result memory) {
        Result memory result;

        // parse transaction
        RLPReader.RLPItem[] memory transaction = rlpTransaction.toRlpItem().toList();
        result.rpcServer = transaction[3].toAddress();

        // parse receipt
        RLPReader.RLPItem[] memory receipt = rlpReceipt.toRlpItem().toList();
        result.status = receipt[0].toBoolean();

        // read logs
        RLPReader.RLPItem[] memory logs = receipt[3].toList();
        RLPReader.RLPItem[] memory eventTuple = logs[logs.length - 1].toList();   // read last emitted event (CallExecuted)
        RLPReader.RLPItem[] memory eventTopics = eventTuple[1].toList();  // topics contain all indexed event fields

        // read parameters from event
        result.callId = eventTopics[1].toUint();  // indices of indexed fields start at 1 (0 is reserved for the hash of the event signature)
        result.rpcProxy = address(eventTopics[2].toUint());
        uint succ = eventTopics[3].toUint();
        if (succ == 0) {
            result.success = false;
        }
        else {
            result.success = true;
        }
        bytes memory returnData = eventTuple[2].toBytes();

        uint returnDataLen;
        assembly {
            returnDataLen := mload(add(returnData, 64))  // length in bytes
            returnData := add(returnData, 96)  // skip first 2 32-byte buckets as these contain no payload
        }
        bytes memory parsedReturnData = new bytes(returnDataLen);
        assembly {
            mstore(parsedReturnData, returnDataLen)
            let i := 1  // next bucket position in parsedCallData
            for
            { let end := add(returnData, returnDataLen) }
            lt(returnData, end)
            { returnData := add(returnData, 32) }
            {
                mstore(add(parsedReturnData, mul(i, 32)), mload(returnData))
                i := add(i, 1)
            }
        }

        result.returnData = parsedReturnData;

        return result;
    }

}
