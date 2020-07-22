pragma solidity >=0.6.0 <0.7.0;

contract MockContract {

    uint myNumber;
    string myString;

    function remoteMethod(uint _myNumber, string memory _myString) public {
        myNumber = _myNumber;
        myString = _myString;
    }
}
