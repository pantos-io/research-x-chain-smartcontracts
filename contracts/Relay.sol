pragma solidity >=0.6.0 <0.7.0;

interface Relay {
    function verifyTransaction(uint8 feeInWei, bytes calldata rlpHeader, uint8 noOfConfirmations, bytes calldata rlpEncodedTx,
        bytes calldata path, bytes calldata rlpEncodedNodes) payable external returns (uint8);
}
