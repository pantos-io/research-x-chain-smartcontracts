pragma solidity >=0.6.0 <0.7.0;

contract MockContract {

    uint public myNumber;
    string public myString;

    function remoteMethod(uint _myNumber, string memory _myString) public {
        myNumber = _myNumber;
        myString = _myString;
    }
}
