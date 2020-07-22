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
    let illegalRpcProxy;
    let otherRpcProxy;  // rpc proxy communicating with another rpc server
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
            const block             = await web3.eth.getBlock(requestResult.receipt.blockHash);
            const tx                = await web3.eth.getTransaction(requestResult.tx);
            const txReceipt         = await web3.eth.getTransactionReceipt(requestResult.tx);
            const rlpHeader         = createRLPHeader(block);
            const rlpEncodedTx      = createRLPTransaction(tx);
            const rlpEncodedReceipt = createRLPReceipt(txReceipt);

            const path = RLP.encode(tx.transactionIndex);
            const rlpEncodedTxNodes = await createTxMerkleProof(block, tx.transactionIndex);
            const rlpEncodedReceiptNodes = await createReceiptMerkleProof(block, tx.transactionIndex);
            const callExecutionData = {
                rlpHeader,
                rlpEncodedTx,
                rlpEncodedReceipt,
                path,
                rlpEncodedTxNodes,
                rlpEncodedReceiptNodes
            };
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
            const block             = await web3.eth.getBlock(requestResult.receipt.blockHash);
            const tx                = await web3.eth.getTransaction(requestResult.tx);
            const txReceipt         = await web3.eth.getTransactionReceipt(requestResult.tx);
            const rlpHeader         = createRLPHeader(block);
            const rlpEncodedTx      = createRLPTransaction(tx);
            const rlpEncodedReceipt = createRLPReceipt(txReceipt);

            const path = RLP.encode(tx.transactionIndex);
            const rlpEncodedTxNodes = await createTxMerkleProof(block, tx.transactionIndex);
            const rlpEncodedReceiptNodes = await createReceiptMerkleProof(block, tx.transactionIndex);
            const callExecutionData = {
                rlpHeader,
                rlpEncodedTx,
                rlpEncodedReceipt,
                path,
                rlpEncodedTxNodes,
                rlpEncodedReceiptNodes
            };
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
            const block             = await web3.eth.getBlock(requestResult.receipt.blockHash);
            const tx                = await web3.eth.getTransaction(requestResult.tx);
            const txReceipt         = await web3.eth.getTransactionReceipt(requestResult.tx);
            const rlpHeader         = createRLPHeader(block);
            const rlpEncodedTx      = createRLPTransaction(tx);
            const rlpEncodedReceipt = createRLPReceipt(txReceipt);

            const path = RLP.encode(tx.transactionIndex);
            const rlpEncodedTxNodes = await createTxMerkleProof(block, tx.transactionIndex);
            const rlpEncodedReceiptNodes = await createReceiptMerkleProof(block, tx.transactionIndex);
            const callExecutionData = {
                rlpHeader,
                rlpEncodedTx,
                rlpEncodedReceipt,
                path,
                rlpEncodedTxNodes,
                rlpEncodedReceiptNodes
            };
            await expectRevert(rpcServer.executeCall(callExecutionData), "non-existent call request");
        });

        it.only("should throw error 'failed call request' when executing a call request that failed on the proxy", async () => {
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
            const requestResult = await rpcProxy.requestCall(expectedCallId);  // this fails

            // execute remote call
            const block             = await web3.eth.getBlock(requestResult.receipt.blockHash);
            const tx                = await web3.eth.getTransaction(requestResult.tx);
            const txReceipt         = await web3.eth.getTransactionReceipt(requestResult.tx);
            txReceipt.status        = false;    // set status to false to indicate a "failed" transaction
            const rlpHeader         = createRLPHeader(block);
            const rlpEncodedTx      = createRLPTransaction(tx);
            const rlpEncodedReceipt = createRLPReceipt(txReceipt);

            const path = RLP.encode(tx.transactionIndex);
            const rlpEncodedTxNodes = await createTxMerkleProof(block, tx.transactionIndex);
            const rlpEncodedReceiptNodes = await createReceiptMerkleProof(block, tx.transactionIndex);
            const callExecutionData = {
                rlpHeader,
                rlpEncodedTx,
                rlpEncodedReceipt,
                path,
                rlpEncodedTxNodes,
                rlpEncodedReceiptNodes
            };
            await expectRevert(rpcServer.executeCall(callExecutionData), "failed call request");
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
