const {createProofData} = require('../utils');
const {expectRevert, expectEvent} = require('@openzeppelin/test-helpers');

const RPCProxy = artifacts.require('./RPCProxy');
const RPCServer = artifacts.require('./RPCServer');
const MockRelay = artifacts.require('./MockRelay');
const MockContract = artifacts.require('./MockContract');

contract('RPCServer', async (accounts) => {

    let rpcProxy;
    let illegalRpcProxy;
    let otherRpcProxy;  // rpc proxy communicating with another rpc server
    let rpcServer;
    let mockRelay;
    let remoteContract;

    beforeEach(async () => {
        mockRelay = await MockRelay.new({
            from: accounts[0],
        });
        remoteContract = await MockContract.new({
            from: accounts[0],
        });
        rpcServer = await RPCServer.new({
            from: accounts[0],
        });
        rpcProxy = await RPCProxy.new(rpcServer.address, mockRelay.address, {
            from: accounts[0],
        });
        illegalRpcProxy = await RPCProxy.new(rpcServer.address, mockRelay.address, {
            from: accounts[0],
        });
        otherRpcProxy = await RPCProxy.new(accounts[1], mockRelay.address, {
            from: accounts[0],
        });
        await rpcServer.addProxy(rpcProxy.address, mockRelay.address, 0);
    });


    describe('Function: executeCall', function () {

        it("should throw error 'illegal proxy address' when trying to execute a call from an illegal proxy", async () => {
            const contractAddr = remoteContract.address;
            const dappSpecificId = '1';
            const callData = web3.eth.abi.encodeFunctionCall({
                name: 'remoteMethod',
                type: 'function',
                inputs: [{
                    type: 'uint256',
                    name: '_myNumber'
                },{
                    type: 'string',
                    name: '_myString'
                }]
            }, ['2345675643', 'Hello!%']);
            const callback = 'callbackFunction';

            // prepare and request remote call
            const expectedCallId = await rpcProxy.nextCallId();
            await illegalRpcProxy.callContract(contractAddr, dappSpecificId, callData, callback);
            const requestResult = await illegalRpcProxy.requestCall(expectedCallId);

            // execute remote call
            const callExecutionData = await createProofData(web3, requestResult);
            await expectRevert(rpcServer.executeCall(callExecutionData), "illegal proxy address");
        });

        it("should throw error 'non-existent call request' when trying to execute a non-existent call request (transaction does not exist)", async () => {
            const contractAddr = remoteContract.address;
            const dappSpecificId = '1';
            const callData = web3.eth.abi.encodeFunctionCall({
                name: 'remoteMethod',
                type: 'function',
                inputs: [{
                    type: 'uint256',
                    name: '_myNumber'
                },{
                    type: 'string',
                    name: '_myString'
                }]
            }, ['2345675643', 'Hello!%']);
            const callback = 'callbackFunction';

            // prepare and request remote call
            const expectedCallId = await rpcProxy.nextCallId();
            await rpcProxy.callContract(contractAddr, dappSpecificId, callData, callback);
            const requestResult = await rpcProxy.requestCall(expectedCallId);

            // mock verification result
            await mockRelay.setTxVerificationResult(1);

            // execute remote call
            const callExecutionData = await createProofData(web3, requestResult);
            await expectRevert(rpcServer.executeCall(callExecutionData), "non-existent call request");
        });

        it("should throw error 'non-existent call request' when trying to execute a non-existent call request (receipt does not exist)", async () => {
            const contractAddr = remoteContract.address;
            const dappSpecificId = '1';
            const callData = web3.eth.abi.encodeFunctionCall({
                name: 'remoteMethod',
                type: 'function',
                inputs: [{
                    type: 'uint256',
                    name: '_myNumber'
                },{
                    type: 'string',
                    name: '_myString'
                }]
            }, ['2345675643', 'Hello!%']);
            const callback = 'callbackFunction';

            // prepare and request remote call
            const expectedCallId = await rpcProxy.nextCallId();
            await rpcProxy.callContract(contractAddr, dappSpecificId, callData, callback);
            const requestResult = await rpcProxy.requestCall(expectedCallId);

            // mock verification result
            await mockRelay.setReceiptVerificationResult(1);

            // execute remote call
            const callExecutionData = await createProofData(web3, requestResult);
            await expectRevert(rpcServer.executeCall(callExecutionData), "non-existent call request");
        });

        it("should throw error 'failed call request' when executing a call request that failed on the proxy", async () => {
            const contractAddr = remoteContract.address;
            const dappSpecificId = '1';
            const callData = web3.eth.abi.encodeFunctionCall({
                name: 'remoteMethod',
                type: 'function',
                inputs: [{
                    type: 'uint256',
                    name: '_myNumber'
                },{
                    type: 'string',
                    name: '_myString'
                }]
            }, ['2345675643', 'Hello!%']);
            const callback = 'callbackFunction';

            // prepare and request remote call
            const expectedCallId = await rpcProxy.nextCallId();
            await rpcProxy.callContract(contractAddr, dappSpecificId, callData, callback);
            const requestResult = await rpcProxy.requestCall(expectedCallId);

            // execute remote call
            const callExecutionData = await createProofData(web3, requestResult, false);
            await expectRevert(rpcServer.executeCall(callExecutionData), "failed call request");
        });

        it("should execute remote call correctly", async () => {
            const contractAddr = remoteContract.address;
            const dappSpecificId = 1;
            const expectedNumber = '2345675643';
            const expectedString = 'Hello!%';
            const callData = web3.eth.abi.encodeFunctionCall({
                name: 'remoteMethod',
                type: 'function',
                inputs: [{
                    type: 'uint256',
                    name: '_myNumber'
                },{
                    type: 'string',
                    name: '_myString'
                }]
            }, [expectedNumber, expectedString]);
            const callback = 'callbackFunction';

            // prepare and request remote call
            const expectedCallId = await rpcProxy.nextCallId();
            await rpcProxy.callContract(contractAddr, dappSpecificId, callData, callback);
            const requestResult = await rpcProxy.requestCall(expectedCallId);

            // execute remote call
            const callExecutionData = await createProofData(web3, requestResult);
            const executionResult = await rpcServer.executeCall(callExecutionData);
            expectEvent.inLogs(executionResult.logs, 'CallExecuted',
                { callId: expectedCallId,
                           remoteRPCProxy: rpcProxy.address,
                           success: true,
                           data: null
                         }
            );
        });

        it("should execute remote call correctly even if remote call fails", async () => {
            const contractAddr = remoteContract.address;
            const dappSpecificId = 1;
            const callData = web3.eth.abi.encodeFunctionCall({
                name: 'failingMethod',
                type: 'function',
                inputs: []
            }, []);
            const callback = 'callbackFunction';

            // prepare and request remote call
            const expectedCallId = await rpcProxy.nextCallId();
            await rpcProxy.callContract(contractAddr, dappSpecificId, callData, callback);
            const requestResult = await rpcProxy.requestCall(expectedCallId);

            // execute remote call
            const callExecutionData = await createProofData(web3, requestResult);
            const executionResult = await rpcServer.executeCall(callExecutionData);
            // uint callId, address remoteRPCProxy, bool success, bytes data
            expectEvent.inLogs(executionResult.logs, 'CallExecuted',
                { callId: expectedCallId,
                           remoteRPCProxy: rpcProxy.address,
                           success: false,
                           data: null
                         }
            );
        });

        it("should throw error 'not enough gas' when executing remote call without enough gas", async () => {
            const contractAddr = remoteContract.address;
            const dappSpecificId = 1;
            const expectedNumber = '2345675643';
            const expectedString = 'Hello!%';
            const callData = web3.eth.abi.encodeFunctionCall({
                name: 'remoteMethod',
                type: 'function',
                inputs: [{
                    type: 'uint256',
                    name: '_myNumber'
                },{
                    type: 'string',
                    name: '_myString'
                }]
            }, [expectedNumber, expectedString]);
            const callback = 'callbackFunction';

            // prepare and request remote call
            const expectedCallId = await rpcProxy.nextCallId();
            await rpcProxy.callContract(contractAddr, dappSpecificId, callData, callback);
            const requestResult = await rpcProxy.requestCall(expectedCallId);

            // execute remote call
            const callExecutionData = await createProofData(web3, requestResult);
            await expectRevert(rpcServer.executeCall(callExecutionData, {
                gas: 1000000
            }), "not enough gas");

            const executionResult = await rpcServer.executeCall(callExecutionData, {
                gas: 1500000
            });
            expectEvent.inLogs(executionResult.logs, 'CallExecuted',
                { callId: expectedCallId,
                    remoteRPCProxy: rpcProxy.address,
                    success: true,
                    data: null
                }
            );
        });

        it("should throw error 'multiple call execution' when executing remote call more than once", async () => {
            const contractAddr = remoteContract.address;
            const dappSpecificId = 1;
            const expectedNumber = '2345675643';
            const expectedString = 'Hello!%';
            const callData = web3.eth.abi.encodeFunctionCall({
                name: 'remoteMethod',
                type: 'function',
                inputs: [{
                    type: 'uint256',
                    name: '_myNumber'
                },{
                    type: 'string',
                    name: '_myString'
                }]
            }, [expectedNumber, expectedString]);
            const callback = 'callbackFunction';

            // prepare and request remote call
            const expectedCallId = await rpcProxy.nextCallId();
            await rpcProxy.callContract(contractAddr, dappSpecificId, callData, callback);
            const requestResult = await rpcProxy.requestCall(expectedCallId);

            // execute remote call
            const callExecutionData = await createProofData(web3, requestResult);
            const executionResult = await rpcServer.executeCall(callExecutionData, {
                gas: 1500000
            });
            expectEvent.inLogs(executionResult.logs, 'CallExecuted',
                { callId: expectedCallId,
                    remoteRPCProxy: rpcProxy.address,
                    success: true,
                    data: null
                }
            );
            await expectRevert(rpcServer.executeCall(callExecutionData, {
                gas: 1500000
            }), "multiple call execution");
        });

    });
});
