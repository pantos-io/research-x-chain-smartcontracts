pragma solidity >=0.6.0 <0.7.0;

contract MockContract {

    uint public myNumber;
    string public myString;
    bytes public callData;

    function remoteMethod(uint _myNumber, string memory _myString) public {
        myNumber = _myNumber;
        myString = _myString;
        callData = msg.data;
    }

    function remoteMethod2() public {

    }
}
