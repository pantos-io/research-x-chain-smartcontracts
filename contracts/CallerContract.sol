pragma solidity >=0.6.0 <0.7.0;

import "./RPCProxy.sol";

contract CallerContract {

    RPCProxy rpcProxy;
    address remoteContract;
    uint public dappSpecificId;

    constructor(address rpcProxyAddr, address remoteContractAddr) public {
        rpcProxy = RPCProxy(rpcProxyAddr);
        remoteContract = remoteContractAddr;
    }

    function callRemoteMethod(uint _myNumber, string memory _myString, uint _dappSpecificId) public {
        dappSpecificId = 0;
        bytes memory callData = abi.encodeWithSignature("remoteMethod(uint256,string)", _myNumber, _myString);
        rpcProxy.callContract(remoteContract, _dappSpecificId, callData, "myCallback");
    }

    function myCallback(uint dappId, bytes memory result, bool success) public {
        dappSpecificId = dappId;
    }

    function callRemoteMethodFailedCallback(uint _myNumber, string memory _myString, uint _dappSpecificId) public {
        dappSpecificId = 0;
        bytes memory callData = abi.encodeWithSignature("remoteMethod(uint256,string)", _myNumber, _myString);
        rpcProxy.callContract(remoteContract, _dappSpecificId, callData, "callbackWithFailure");
    }

    function callbackWithFailure(uint dappId, bytes memory result, bool success) public {
        require(false);
    }
}
