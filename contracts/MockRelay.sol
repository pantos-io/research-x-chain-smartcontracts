pragma solidity >=0.6.0 <0.7.0;

import "./Relay.sol";

contract MockRelay is Relay {

    uint8 txVerificationResult = 0;
    uint8 receiptVerificationResult = 0;

    function setTxVerificationResult(uint8 _returnValue) public {
        txVerificationResult = _returnValue;
    }

    function setReceiptVerificationResult(uint8 _returnValue) public {
        receiptVerificationResult = _returnValue;
    }

    function verifyTransaction(uint8 feeInWei, bytes calldata rlpHeader, uint8 noOfConfirmations, bytes calldata rlpEncodedTx,
        bytes calldata path, bytes calldata rlpEncodedNodes) payable external override returns (uint8) {
        return txVerificationResult;
    }

    function verifyReceipt(uint8 feeInWei, bytes calldata rlpHeader, uint8 noOfConfirmations, bytes calldata rlpEncodedReceipt,
        bytes calldata path, bytes calldata rlpEncodedNodes) payable external override returns (uint8) {
        return receiptVerificationResult;
    }
}
