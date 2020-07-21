pragma solidity >=0.6.0 <0.7.0;

import "./Relay.sol";

contract MockRelay is Relay {

    uint8 returnValue = 1;

    function setReturnValue(uint8 _returnValue) public {
        returnValue = _returnValue;
    }

    function verifyTransaction(uint8 feeInWei, bytes calldata rlpHeader, uint8 noOfConfirmations, bytes calldata rlpEncodedTx,
        bytes calldata path, bytes calldata rlpEncodedNodes) payable external override returns (uint8) {
        return returnValue;
    }
}
