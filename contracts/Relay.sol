pragma solidity >=0.6.0 <0.7.0;

contract Relay {
    function verifyTransaction(uint feeInWei, bytes memory rlpHeader, uint8 noOfConfirmations, bytes memory rlpEncodedTx,
        bytes memory path, bytes memory rlpEncodedNodes) payable public returns (uint8);
}
