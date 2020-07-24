const {expectRevert, expectEvent} = require('@openzeppelin/test-helpers');
const {expect} = require('chai');
const {createProofData} = require('../utils');

const RPCProxy = artifacts.require('./RPCProxy');
const RPCServer = artifacts.require('./RPCServer');
const MockRelay = artifacts.require('./MockRelay');
const CalleeContract = artifacts.require('./CalleeContract');
const CallerContract = artifacts.require('./CallerContract');

contract('RPCProxy', async (accounts) => {

    let rpcProxy, rpcServer, illegalRpcProxy, illegalRpcServer,  mockRelay, calleeContract, callerContract, otherRpcProxy;

    before(async () => {
    });

    beforeEach(async () => {
        mockRelay = await MockRelay.new({
            from: accounts[0],
        });
        calleeContract = await CalleeContract.new({
            from: accounts[0],
        });
        rpcServer = await RPCServer.new({
            from: accounts[0],
        });
        rpcProxy = await RPCProxy.new(rpcServer.address, mockRelay.address, {
            from: accounts[0],
        });
        await rpcServer.addProxy(rpcProxy.address, mockRelay.address, 0);
        illegalRpcServer = await RPCServer.new({
            from: accounts[0],
        });
        illegalRpcProxy = await RPCProxy.new(illegalRpcServer.address, mockRelay.address, {
            from: accounts[0],
        });
        await illegalRpcServer.addProxy(illegalRpcProxy.address, mockRelay.address, 0);
        callerContract = await CallerContract.new(rpcProxy.address, calleeContract.address, {
            from: accounts[0],
        });
        otherRpcProxy = await RPCProxy.new(rpcServer.address, mockRelay.address, {
            from: accounts[0],
        });
        await rpcServer.addProxy(otherRpcProxy.address, mockRelay.address, 0);
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

    describe('Function: acknowledgeCall', function () {

        it("should throw error 'illegal rpc server' when acknowledging call from illegal rpc server", async () => {
            const contractAddr = calleeContract.address;
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

            // prepare call on illegal proxy
            const callId = await illegalRpcProxy.nextCallId();
            await illegalRpcProxy.callContract(contractAddr, dappSpecificId, callData, callback);

            // request call on illegal proxy
            const requestResult = await illegalRpcProxy.requestCall(callId);

            // execute call on illegal server
            const callExecutionData = await createProofData(web3, requestResult);
            const executionResult = await illegalRpcServer.executeCall(callExecutionData, {
                gas: 1500000
            });

            // acknowledge call on legal proxy
            const callAcknowledgeData = await createProofData(web3, executionResult);
            await expectRevert(rpcProxy.acknowledgeCall(callAcknowledgeData, {
                gas: 1500000
            }), 'illegal rpc server');
        });

        it("should throw error 'non-existent call execution' when acknowledging call that was never executed", async () => {
            const contractAddr = calleeContract.address;
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

            // prepare call on illegal proxy
            const callId = await rpcProxy.nextCallId();
            await rpcProxy.callContract(contractAddr, dappSpecificId, callData, callback);

            // request call on illegal proxy
            const requestResult = await rpcProxy.requestCall(callId);

            // execute call on illegal server
            const callExecutionData = await createProofData(web3, requestResult);
            const executionResult = await rpcServer.executeCall(callExecutionData, {
                gas: 1500000
            });

            // acknowledge call on legal proxy
            await mockRelay.setTxVerificationResult(1);
            let callAcknowledgeData = await createProofData(web3, executionResult);
            await expectRevert(rpcProxy.acknowledgeCall(callAcknowledgeData, {
                gas: 1500000
            }), 'non-existent call execution');

            await mockRelay.setTxVerificationResult(0);
            await mockRelay.setReceiptVerificationResult(1);
            callAcknowledgeData = await createProofData(web3, executionResult);
            await expectRevert(rpcProxy.acknowledgeCall(callAcknowledgeData, {
                gas: 1500000
            }), 'non-existent call execution');
        });

        it("should throw error 'failed call execution' when acknowledging call that failed", async () => {
            const contractAddr = calleeContract.address;
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

            // prepare call on proxy
            const callId = await rpcProxy.nextCallId();
            await rpcProxy.callContract(contractAddr, dappSpecificId, callData, callback);

            // request call on proxy
            const requestResult = await rpcProxy.requestCall(callId);

            // execute call on server
            const callExecutionData = await createProofData(web3, requestResult);
            const executionResult = await rpcServer.executeCall(callExecutionData, {
                gas: 1500000
            });

            // acknowledge call on legal proxy
            let callAcknowledgeData = await createProofData(web3, executionResult, false);
            await expectRevert(rpcProxy.acknowledgeCall(callAcknowledgeData, {
                gas: 1500000
            }), 'failed call execution');
        });

        it("should successfully process acknowledgement", async () => {
            const contractAddr = calleeContract.address;

            // prepare call on proxy
            const callId = await rpcProxy.nextCallId();
            const expectedDappId = 1;
            await callerContract.callRemoteMethod(5, "test", expectedDappId);

            // request call on proxy
            const requestResult = await rpcProxy.requestCall(callId);

            // execute call on server
            const callExecutionData = await createProofData(web3, requestResult);
            const executionResult = await rpcServer.executeCall(callExecutionData, {
                gas: 1500000
            });

            // acknowledge call on legal proxy
            let callAcknowledgeData = await createProofData(web3, executionResult);
            const result = await rpcProxy.acknowledgeCall(callAcknowledgeData, {
                gas: 1500000
            });
            expectEvent.inLogs(result.logs, 'CallAcknowledged',
                { callId: callId,
                    success: true
                }
            );
            expect(await callerContract.dappSpecificId()).to.be.bignumber.equal(web3.utils.toBN(expectedDappId));
        });

        it("should successfully process acknowledgement even if callback fails", async () => {
            const contractAddr = calleeContract.address;

            // prepare call on proxy
            const callId = await rpcProxy.nextCallId();
            const expectedDappId = 1;
            await callerContract.callRemoteMethodFailedCallback(5, "test", expectedDappId);

            // request call on proxy
            const requestResult = await rpcProxy.requestCall(callId);

            // execute call on server
            const callExecutionData = await createProofData(web3, requestResult);
            const executionResult = await rpcServer.executeCall(callExecutionData, {
                gas: 1500000
            });

            // acknowledge call on legal proxy
            let callAcknowledgeData = await createProofData(web3, executionResult);
            const result = await rpcProxy.acknowledgeCall(callAcknowledgeData, {
                gas: 1500000
            });
            expectEvent.inLogs(result.logs, 'CallAcknowledged',
                { callId: callId,
                    success: false
                }
            );
            expect(await callerContract.dappSpecificId()).to.be.bignumber.equal(web3.utils.toBN(0));
        });

        it("should throw error 'not enough gas' when acknowledging a call without enough gas", async () => {
            const contractAddr = calleeContract.address;

            // prepare call on proxy
            const callId = await rpcProxy.nextCallId();
            const expectedDappId = 1;
            await callerContract.callRemoteMethod(5, "test", expectedDappId);

            // request call on proxy
            const requestResult = await rpcProxy.requestCall(callId);

            // execute call on server
            const callExecutionData = await createProofData(web3, requestResult);
            const executionResult = await rpcServer.executeCall(callExecutionData, {
                gas: 1500000
            });

            // acknowledge call on legal proxy
            let callAcknowledgeData = await createProofData(web3, executionResult);
            await expectRevert(rpcProxy.acknowledgeCall(callAcknowledgeData, {
                gas: 1000000
            }), 'not enough gas');

            expect(await callerContract.dappSpecificId()).to.be.bignumber.equal(web3.utils.toBN(0));
        });

        it("should throw error 'multiple call acknowledgement' when acknowledging a call multiple times", async () => {
            const contractAddr = calleeContract.address;

            // prepare call on proxy
            const callId = await rpcProxy.nextCallId();
            const expectedDappId = 1;
            await callerContract.callRemoteMethod(5, "test", expectedDappId);

            // request call on proxy
            const requestResult = await rpcProxy.requestCall(callId);

            // execute call on server
            const callExecutionData = await createProofData(web3, requestResult);
            const executionResult = await rpcServer.executeCall(callExecutionData, {
                gas: 1500000
            });

            // acknowledge call on legal proxy
            let callAcknowledgeData = await createProofData(web3, executionResult);
            await rpcProxy.acknowledgeCall(callAcknowledgeData, {
                gas: 1500000
            });
            await expectRevert(rpcProxy.acknowledgeCall(callAcknowledgeData, {
                gas: 1500000
            }), 'multiple call acknowledgement');
        });

        it("should throw error 'incorrect rpc proxy' when acknowledging a call on an incorrect proxy", async () => {
            const contractAddr = calleeContract.address;

            // prepare call on proxy
            const callId = await rpcProxy.nextCallId();
            const expectedDappId = 1;
            await callerContract.callRemoteMethod(5, "test", expectedDappId);

            // request call on proxy
            const requestResult = await rpcProxy.requestCall(callId);

            // execute call on server
            const callExecutionData = await createProofData(web3, requestResult);
            const executionResult = await rpcServer.executeCall(callExecutionData, {
                gas: 1500000
            });

            // acknowledge call on legal proxy
            let callAcknowledgeData = await createProofData(web3, executionResult);
            await expectRevert(otherRpcProxy.acknowledgeCall(callAcknowledgeData, {
                gas: 1500000
            }), 'incorrect rpc proxy');
        });
    });

});
