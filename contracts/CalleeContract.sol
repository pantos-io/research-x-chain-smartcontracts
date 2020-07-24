pragma solidity >=0.6.0 <0.7.0;

contract CalleeContract {

    uint public myNumber;
    string public myString;

    function failingMethod() public {
        require(false);
    }

    function remoteMethod(uint _myNumber, string memory _myString) public {
        myNumber = _myNumber;
        myString = _myString;
    }

}
