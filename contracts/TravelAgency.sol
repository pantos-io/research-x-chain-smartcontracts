pragma solidity >=0.6.0 <0.7.0;

import "./RPCProxy.sol";

contract TravelAgency {

    struct Trip {
        address guest;
        uint from;
        uint to;
        uint hotelReservation;
        uint trainReservation;
    }

    address private hotelAddr;
    address private railwayCompanyAddr;
    RPCProxy private blockchainA;
    RPCProxy private blockchainB;
    uint private nextTripId;
    mapping(uint => Trip) public trips;


    constructor(address _blockchainA, address _blockchainB, address _hotelAddr, address _railwayCompanyAddr) public {
        blockchainA = RPCProxy(_blockchainA);
        blockchainB = RPCProxy(_blockchainB);
        hotelAddr = _hotelAddr;
        railwayCompanyAddr = _railwayCompanyAddr;
    }

    function bookTrip(address guest, uint from, uint to) public {
        trips[nextTripId].guest = guest;
        trips[nextTripId].from = from;
        trips[nextTripId].to = to;
        bytes memory callData = abi.encodeWithSignature("bookRoom(address, uint, uint)", guest, from, to);
        blockchainA.callContract(hotelAddr, nextTripId, "bookHotelCallback", callData);
//        blockchainA
//            .contractCall(hotelAddr, nextTripId, "bookHotelCallback")
//            .bookRoom(guest, from, to);
        ++nextTripId;
    }

    function bookHotelCallback(uint tripId, uint result, uint errorCode) public {
        if (errorCode == 0) {
            uint hotelReservation = uint(result);
            trips[tripId].hotelReservation = hotelReservation;
            bytes memory callData = abi.encodeWithSignature("bookTicket(uint, bytes, uint)", tripId, result, errorCode);
            blockchainB.callContract(railwayCompanyAddr, tripId, "bookTrainCallback", callData);
//            blockchainB
//                .contractCall(railwayCompanyAddr, tripId, "bookTrainCallback")
//                .bookTicket(trips[tripId].guest, trips[tripId].from, trips[tripId].to);
        }
        else {
            delete trips[tripId];
            // TODO: emit bookingFailed(tripId);
        }
    }

    function bookTrainCallback(uint tripId, uint result, uint errorCode) public {
        if (errorCode == 0) {
            trips[tripId].trainReservation = uint(result);
            // TODO: emit event BookingSuccessful(tripId);
        }
        else {
            bytes memory callData = abi.encodeWithSignature("cancelRoom(uint)", trips[tripId].hotelReservation);
            blockchainA.callContract(hotelAddr, tripId, "cancelHotelCallback", callData);
//            blockchainA
//                .callContract(hotelAddr, tripId, "cancelHotelCallback")
//                .cancelRoom(trips[tripId].hotelReservation);
        }
    }

    function cancelHotelCallback(uint tripId, bytes memory result, uint errorCode) public {
        if (errorCode == 0) {
            delete trips[tripId];
            // TODO: emit bookingFailed(tripId);
        }
        else {
            // TODO: emit some event
        }
    }

}
