const {
    createRLPHeader,
    createRLPReceipt,
    createRLPTransaction,
} = require("../utils");
const { BaseTrie: Trie } = require('merkle-patricia-tree');
const RLP = require('rlp');

const {expectRevert, expectEvent} = require('@openzeppelin/test-helpers');
const {expect} = require('chai');

const RPCProxy = artifacts.require('./RPCProxy');
const RPCServer = artifacts.require('./RPCServer');
const MockRelay = artifacts.require('./MockRelay');
const MockContract = artifacts.require('./MockContract');

contract('RPCServer', async (accounts) => {

    let rpcProxy;
    let rpcServer;
    let mockRelay;
    let remoteContract;

    before(async () => {
        mockRelay = await MockRelay.new({
            from: accounts[0],
        });
        remoteContract = await MockContract.new({
            from: accounts[0],
        })
    });

    beforeEach(async () => {
        rpcServer = await RPCServer.new({
            from: accounts[0],
        });
        rpcProxy = await RPCProxy.new(rpcServer.address, mockRelay.address, {
            from: accounts[0],
        });
        await rpcServer.addProxy(rpcProxy.address, mockRelay.address, 0);
    });


    describe('Function: executeCall', function () {

        it.only("should throw error 'illegal proxy address' when trying to execute a call from an illegal proxy", async () => {
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
            const block             = await web3.eth.getBlock(requestResult.receipt.blockHash);
            const tx                = await web3.eth.getTransaction(requestResult.tx);
            const txReceipt         = await web3.eth.getTransactionReceipt(requestResult.tx);
            const rlpHeader         = createRLPHeader(block);
            const rlpEncodedTx      = createRLPTransaction(tx);
            const rlpEncodedReceipt = createRLPReceipt(txReceipt);

            const path = RLP.encode(tx.transactionIndex);
            const rlpEncodedTxNodes = await createTxMerkleProof(block, tx.transactionIndex);
            const rlpEncodedReceiptNodes = await createReceiptMerkleProof(block, tx.transactionIndex);
            await expectRevert(rpcServer.executeCall(rlpHeader, rlpEncodedTx, rlpEncodedReceipt, path, rlpEncodedTxNodes, rlpEncodedReceiptNodes), "illegal proxy address");
        });

        it("should prepare a remote function call correctly", async () => {
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

            const expectedCallId = await rpcProxy.nextCallId();
            const ret = await rpcProxy.callContract(contractAddr, dappSpecificId, callData, callback);

            // check emitted event
            expectEvent.inLogs(ret.logs, 'CallPrepared', { callId: expectedCallId });

            // check stored call data
            const storedCall = await rpcProxy.getPendingCall(expectedCallId);
            expect(storedCall.caller).to.equal(accounts[0]);
            expect(storedCall.contractAddress).to.equal(remoteContract.address);
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
                remoteRPCServer: rpcServer.address,
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
