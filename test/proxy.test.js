const {expectRevert, expectEvent} = require('@openzeppelin/test-helpers');
const {expect} = require('chai');

const RPCProxy = artifacts.require('./RPCProxy');
const RPCServer = artifacts.require('./RPCServer');
const MockRelay = artifacts.require('./MockRelay');

contract('RPCProxy', async (accounts) => {

    let rpcProxy;
    let rpcServer;
    let mockRelay;

    before(async () => {
    });

    beforeEach(async () => {
        mockRelay = await MockRelay.new({
            from: accounts[0],
        });
        rpcServer = await RPCServer.new({
            from: accounts[0],
        });
        rpcProxy = await RPCProxy.new(rpcServer.address, mockRelay.address, {
            from: accounts[0],
        });
        await rpcServer.addProxy(rpcProxy.address, mockRelay.address, 0);
    });


    describe('Function: callContract', function () {

        it("should prepare a remote function call correctly", async () => {
            const contractAddr = accounts[0];
            const dappSpecificId = '1';
            const callData = web3.eth.abi.encodeFunctionCall({
                name: 'myMethod',
                type: 'function',
                inputs: [{
                    type: 'uint256',
                    name: 'myNumber'
                },{
                    type: 'string',
                    name: 'myString'
                }]
            }, ['2345675643', 'Hello!%']);
            const callback = 'callbackFunction';

            const expectedCallId = await rpcProxy.nextCallId();
            const ret = await rpcProxy.callContract(contractAddr, dappSpecificId, callData, callback);

            // check emitted event
            expectEvent.inLogs(ret.logs, 'CallPrepared', { callId: expectedCallId });

            // check stored call data
            const storedCall = await rpcProxy.getPendingCall(expectedCallId);
            expect(storedCall.caller).to.equal(accounts[0]);
            expect(storedCall.contractAddress).to.equal(accounts[0]);
            expect(storedCall.dappSpecificId).to.equal(dappSpecificId);
            expect(storedCall.callback).to.equal(callback);
            expect(storedCall.callData).to.equal(callData);

            // check next call id
            const expectedNextCallId = expectedCallId.add(web3.utils.toBN(1));
            const actualNextCallId = await rpcProxy.nextCallId();
            expect(actualNextCallId).to.be.bignumber.equal(expectedNextCallId);
        });

    });

    describe('Function: requestCall', function () {

        it("should throw error 'non-existent call' when requesting call for non-existent call data", async () => {
            const nonExistentCallId = '1';
            await expectRevert(rpcProxy.requestCall(nonExistentCallId), "non-existent call");
        });

        it("request a remote call correctly", async () => {
            const contractAddr = accounts[0];
            const dappSpecificId = '1';
            const callData = web3.eth.abi.encodeFunctionCall({
                name: 'myMethod',
                type: 'function',
                inputs: [{
                    type: 'uint256',
                    name: 'myNumber'
                },{
                    type: 'string',
                    name: 'myString'
                }]
            }, ['2345675643', 'Hello!%']);
            const callback = 'callbackFunction';

            // prepare call
            const expectedCallId = await rpcProxy.nextCallId();
            await rpcProxy.callContract(contractAddr, dappSpecificId, callData, callback);

            // request call
            const ret = await rpcProxy.requestCall(expectedCallId);
            expectEvent.inLogs(ret.logs, 'CallRequested', {
                callId: expectedCallId,
                caller: accounts[0],
                remoteContract: contractAddr,
                callData: callData
            });
        });

        it("should throw error 'non-existent call' when a call is requested multiple times", async () => {
            const contractAddr = accounts[0];
            const dappSpecificId = '1';
            const callData = web3.eth.abi.encodeFunctionCall({
                name: 'myMethod',
                type: 'function',
                inputs: [{
                    type: 'uint256',
                    name: 'myNumber'
                },{
                    type: 'string',
                    name: 'myString'
                }]
            }, ['2345675643', 'Hello!%']);
            const callback = 'callbackFunction';

            // prepare call
            const expectedCallId = await rpcProxy.nextCallId();
            await rpcProxy.callContract(contractAddr, dappSpecificId, callData, callback);

            // request call for the first time (should succeed)
            await rpcProxy.requestCall(expectedCallId);

            // request call for the second time (should fail)
            await expectRevert(rpcProxy.requestCall(expectedCallId), "non-existent call");
        });
    });
});
