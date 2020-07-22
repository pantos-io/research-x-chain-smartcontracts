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

    uint256 constant public MIN_CALL_GAS = 1000000;
    uint256 constant public MIN_CALL_GAS_CHECK = 1015874;


    event CallExecuted(uint callId, address remoteRPCProxy, bool success, bytes data);
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

    event CallEvent(address contractAddr, bytes callData);
    function executeCall(CallExecution calldata callExecution) external {
//    function executeCall(bytes calldata rlpHeader, bytes calldata rlpEncodedTx, bytes calldata rlpEncodedReceipt,
//        bytes calldata path, bytes calldata rlpEncodedTxNodes, bytes calldata rlpEncodedReceiptNodes) external {
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
//TODO:
// RPCServer.sol:35:60: CompilerError: Stack too deep, try removing local variables.
//     uint8 verified = relay.verifyTransaction(feeInWei, rlpHeader, reqConfirmations, rlpEncodedTx, path, rlpEncodedNodes);
//                                                        ^-------^
// Creating RelayMeta instead of separate relayAddress and reqConfirmations solves this.

//        (address intendedRPCServer, address contractAddr, bytes memory callData, uint callId) = extractCall(rlpEncodedTx);
//        require(intendedRPCServer == address(this));

//        require (gasleft() >= MIN_CALL_GAS_CHECK);
        emit CallEvent(call.contractAddress, call.callData);
//        (bool success, bytes memory data) = call.contractAddress.call{gas: MIN_CALL_GAS}(call.callData);
        (bool success, bytes memory data) = call.contractAddress.call(call.callData);
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
        call.callData = eventTuple[2].toRlpBytes();

        return call;
    }

}
