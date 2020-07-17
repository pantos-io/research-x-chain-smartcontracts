pragma solidity >=0.6.0 <0.7.0;

import "./RPCProxy.sol";

contract Token {

    address tokenOnB;
    RPCProxy blockchainB;
    uint256 transferId = 1;

    function transferToChain(address _recipient, uint256 _amount) public {
        bytes memory callData = abi.encodeWithSignature("claimTokens(address, uint256)", _recipient, _amount);
        blockchainB.callContract(tokenOnB, transferId, "ackTransfer", callData);
        transferId++;
    }
}
