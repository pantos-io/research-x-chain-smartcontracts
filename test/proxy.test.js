const {expectRevert, expectEvent} = require('@openzeppelin/test-helpers');
const {expect} = require('chai');
const {
    createRLPHeader,
    createRLPReceipt,
    createRLPTransaction,
} = require("../utils");
const RLP = require('rlp');
const { BaseTrie: Trie } = require('merkle-patricia-tree');

const RPCProxy = artifacts.require('./RPCProxy');
const RPCServer = artifacts.require('./RPCServer');
const MockRelay = artifacts.require('./MockRelay');
const MockContract = artifacts.require('./MockContract');

contract('RPCProxy', async (accounts) => {

    let rpcProxy, rpcServer, illegalRpcProxy, illegalRpcServer,  mockRelay, remoteContract;

    before(async () => {
    });

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
        await rpcServer.addProxy(rpcProxy.address, mockRelay.address, 0);
        illegalRpcServer = await RPCServer.new({
            from: accounts[0],
        });
        illegalRpcProxy = await RPCProxy.new(illegalRpcServer.address, mockRelay.address, {
            from: accounts[0],
        });
        await illegalRpcServer.addProxy(illegalRpcProxy.address, mockRelay.address, 0);
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

        it.only("should throw error 'illegal rpc server' when acknowledging call from illegal rpc server", async () => {
            const contractAddr = remoteContract.address;
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
            await illegalRpcProxy.callContract(contractAddr, dappSpecificId, callData, callback);

            // request call on illegal proxy
            const requestResult = await illegalRpcProxy.requestCall(callId);

            // execute call on illegal server
            const callExecutionData = await createProofData(requestResult);
            const executionResult = await illegalRpcServer.executeCall(callExecutionData, {
                gas: 1500000
            });

            // acknowledge call on legal proxy
            const callAcknowledgeData = await createProofData(executionResult);
            await expectRevert(rpcProxy.acknowledgeCall(callAcknowledgeData, {
                gas: 1500000
            }), 'illegal rpc server');
        });
    });

    const createProofData = async (result) => {
        const block             = await web3.eth.getBlock(result.receipt.blockHash);
        const tx                = await web3.eth.getTransaction(result.tx);
        const txReceipt         = await web3.eth.getTransactionReceipt(result.tx);
        const rlpHeader         = createRLPHeader(block);
        const rlpEncodedTx      = createRLPTransaction(tx);
        const rlpEncodedReceipt = createRLPReceipt(txReceipt);

        const path = RLP.encode(tx.transactionIndex);
        const rlpEncodedTxNodes = await createTxMerkleProof(block, tx.transactionIndex);
        const rlpEncodedReceiptNodes = await createReceiptMerkleProof(block, tx.transactionIndex);
        return {
            rlpHeader,
            rlpEncodedTx,
            rlpEncodedReceipt,
            path,
            rlpEncodedTxNodes,
            rlpEncodedReceiptNodes
        };
    };

    const createTxMerkleProof = async (block, transactionIndex) => {
        const trie = new Trie();

        for (let i=0; i<block.transactions.length; i++) {
            const tx = await web3.eth.getTransaction(block.transactions[i]);
            const rlpTx = createRLPTransaction(tx);
            const key = RLP.encode(i);
            await trie.put(key, rlpTx);
        }

        const key = RLP.encode(transactionIndex);
        return RLP.encode(await Trie.createProof(trie, key));
    };

    const createReceiptMerkleProof = async (block, transactionIndex) => {
        const trie = new Trie();

        for (let i=0; i<block.transactions.length; i++) {
            const receipt = await web3.eth.getTransactionReceipt(block.transactions[i]);
            const rlpReceipt = createRLPReceipt(receipt);
            const key = RLP.encode(i);
            await trie.put(key, rlpReceipt);
        }

        const key = RLP.encode(transactionIndex);
        return RLP.encode(await Trie.createProof(trie, key));
    }
});
