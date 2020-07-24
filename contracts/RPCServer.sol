pragma solidity >=0.6.0 <0.7.0;
pragma experimental ABIEncoderV2;

import "./Relay.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./RLPReader.sol";


contract RPCServer is Ownable {

    using RLPReader for RLPReader.RLPItem;
    using RLPReader for bytes;

    // struct representing an RPCProxy at another blockchain
    struct Proxy {
        address relayAddress;
        uint8 requiredConfirmations;
    }
    mapping(address => Proxy) proxies;

    struct CallExecution {
        bytes rlpHeader;
        bytes rlpEncodedTx;
        bytes rlpEncodedReceipt;
        bytes path;
        bytes rlpEncodedTxNodes;
        bytes rlpEncodedReceiptNodes;
    }

    struct Call {
        address rpcProxy;
        bool status;
        uint callId;
        address caller;
        address contractAddress;
        bytes callData;
    }

    mapping (bytes32 => bool) executedCalls;    // transaction hash => boolean

    uint256 constant public MIN_CALL_GAS = 1000000;
    uint256 constant public MIN_CALL_GAS_CHECK = 1015874;


    event CallExecuted(uint indexed callId, address indexed remoteRPCProxy, bool indexed success, bytes data);
    event ProxyAdded(address indexed proxyAddress, address relayAddress, uint8 requiredConfirmations);
    event ProxyRemoved(address indexed proxyAddress);

    function addProxy(address proxyAddress, address relayAddress, uint8 requiredConfirmations) public onlyOwner {
        require(proxyAddress != address(0), 'proxy address cannot be 0');
        require(relayAddress != address(0), 'relay address cannot be 0');

        proxies[proxyAddress].relayAddress = relayAddress;
        proxies[proxyAddress].requiredConfirmations = requiredConfirmations;
        emit ProxyAdded(proxyAddress, relayAddress, requiredConfirmations);
    }

    function removeProxy(address proxyAddress) public onlyOwner {
        delete proxies[proxyAddress];
        emit ProxyRemoved(proxyAddress);
    }

    function executeCall(CallExecution calldata callExecution) external {
        uint8 feeInWei = 0;

        Call memory call = extractCall(callExecution.rlpEncodedTx, callExecution.rlpEncodedReceipt);
        Proxy memory proxy = proxies[call.rpcProxy];
        require(proxy.relayAddress != address(0), 'illegal proxy address');
        require(call.status == true, 'failed call request');

        uint8 verificationResult = Relay(proxy.relayAddress).verifyTransaction(
            feeInWei,
            callExecution.rlpHeader,
            proxy.requiredConfirmations,
            callExecution.rlpEncodedTx,
            callExecution.path,
            callExecution.rlpEncodedTxNodes
        );
        require(verificationResult == 0, 'non-existent call request');
        verificationResult = Relay(proxy.relayAddress).verifyReceipt(
            feeInWei,
            callExecution.rlpHeader,
            proxy.requiredConfirmations,
            callExecution.rlpEncodedReceipt,
            callExecution.path,
            callExecution.rlpEncodedReceiptNodes
        );
        require(verificationResult == 0, 'non-existent call request');

        require(gasleft() >= MIN_CALL_GAS_CHECK, 'not enough gas');
        require(executedCalls[keccak256(callExecution.rlpEncodedTx)] == false, 'multiple call execution');
        executedCalls[keccak256(callExecution.rlpEncodedTx)] = true;
        (bool success, bytes memory data) = call.contractAddress.call{gas: MIN_CALL_GAS}(call.callData);
        emit CallExecuted(call.callId, call.rpcProxy, success, data);
    }

    function extractCall(bytes memory rlpTransaction, bytes memory rlpReceipt) private returns (Call memory) {
        Call memory call;

        // parse transaction
        RLPReader.RLPItem[] memory transaction = rlpTransaction.toRlpItem().toList();
        call.rpcProxy = transaction[3].toAddress();

        // parse receipt
        RLPReader.RLPItem[] memory receipt = rlpReceipt.toRlpItem().toList();
        call.status = receipt[0].toBoolean();

        // read logs
        RLPReader.RLPItem[] memory logs = receipt[3].toList();
        RLPReader.RLPItem[] memory eventTuple = logs[0].toList();
        RLPReader.RLPItem[] memory eventTopics = eventTuple[1].toList();  // topics contain all indexed event fields

        // read parameters from event
        call.callId = eventTopics[1].toUint();  // indices of indexed fields start at 1 (0 is reserved for the hash of the event signature)
        call.caller = address(eventTopics[2].toUint());
        call.contractAddress = address(eventTopics[3].toUint());
        bytes memory callData = eventTuple[2].toBytes();

        uint callDataLen;
        assembly {
            callDataLen := mload(add(callData, 64))  // length in bytes
            callData := add(callData, 96)  // skip first 2 32-byte buckets as these contain no payload
        }
        bytes memory parsedCallData = new bytes(callDataLen);
        assembly {
            mstore(parsedCallData, callDataLen)
            let i := 1  // next bucket position in parsedCallData
            for
                { let end := add(callData, callDataLen) }
                lt(callData, end)
                { callData := add(callData, 32) }
            {
                mstore(add(parsedCallData, mul(i, 32)), mload(callData))
                i := add(i, 1)
            }
        }

        call.callData = parsedCallData;
        return call;
    }

}
