pragma solidity >=0.6.0 <0.7.0;

import "./Relay.sol";
import "./RPC.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract RPCServer is Ownable {

    // struct representing an RPCProxy at another blockchain
    struct Proxy {
        address relayAddress;
        uint8 requiredConfirmations;
    }
    mapping(address => Proxy) proxies;

    uint256 constant public MIN_CALL_GAS = 1000000;
    uint256 constant public MIN_CALL_GAS_CHECK = 1015874;


    event CallExecuted(address remoteRPCProxy, uint callId, bool success, bytes data);
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

    function executeCall(bytes calldata rlpHeader, bytes calldata rlpEncodedTx,
        bytes calldata path, bytes calldata rlpEncodedNodes) external {
        uint8 feeInWei = 0;  // TODO

        address callingProxyAddress = parseRPCProxy(rlpEncodedTx);
        Proxy memory proxy = proxies[callingProxyAddress];
        require(proxy.relayAddress != address(0));
        require(Relay(proxy.relayAddress).verifyTransaction(feeInWei, rlpHeader, proxy.requiredConfirmations, rlpEncodedTx, path, rlpEncodedNodes) == 0);
//TODO: 
// RPCServer.sol:35:60: CompilerError: Stack too deep, try removing local variables.
//     uint8 verified = relay.verifyTransaction(feeInWei, rlpHeader, reqConfirmations, rlpEncodedTx, path, rlpEncodedNodes);
//                                                        ^-------^
// Creating RelayMeta instead of separate relayAddress and reqConfirmations solves this.

        (address intendedRPCServer, address contractAddr, bytes memory callData, uint callId) = parseTx(rlpEncodedTx);
        require(intendedRPCServer == address(this));

        require (gasleft() >= MIN_CALL_GAS_CHECK);
        (bool success, bytes memory data) = contractAddr.call{gas: MIN_CALL_GAS}(callData);
        emit CallExecuted(callingProxyAddress, callId, success, data);
    }

    function parseRPCProxy(bytes memory rlpEncodedTx) private returns (address) {
//TODO
        return address(0);
    }

    function parseTx(bytes memory rlpEncodedTx) private returns (address, address, bytes memory, uint) {
//TODO
        return (address(0), address(0), new bytes(0), 0);
    }

}
