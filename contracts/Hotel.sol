pragma solidity >=0.6.0 <0.7.0;

contract Hotel {

    struct Booking {
        address guest;
        uint from;
        uint to;
    }

    mapping(uint => Booking) private roomBookings;
    uint private nextRoomNr = 1;

    constructor() public {

    }

    function bookRoom( address guest, uint from, uint to) public {
//        require(isFree(nextRoomNr, from, to), "Requested room is occupied");
        roomBookings[nextRoomNr].guest = guest;
        roomBookings[nextRoomNr].from = from;
        roomBookings[nextRoomNr].to = to;
        ++nextRoomNr;
    }

    function cancelRoom(uint bookingNr) public {
        // TODO: delete reservation
    }

    function isFree(uint roomNr, uint from, uint to) private returns(bool) {
        // TODO: implement me
        return true;
    }

}
