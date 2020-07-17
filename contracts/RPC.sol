pragma solidity >=0.6.0 <0.7.0;

library RPC {

    struct Call {
        address caller;
        address contractAddr;
        uint dappSpecificId;
        string callback;
        bytes msgData;
    }

}
