const RLP = require('rlp');
const BN = web3.utils.BN;
const {Transaction} = require('ethereumjs-tx');
const { BaseTrie: Trie } = require('merkle-patricia-tree');

const createProofData = async (web3, result, txStatus) => {
    const block             = await web3.eth.getBlock(result.receipt.blockHash);
    const tx                = await web3.eth.getTransaction(result.tx);
    const txReceipt         = await web3.eth.getTransactionReceipt(result.tx);
    if (txStatus !== undefined) {
        txReceipt.status = txStatus;
    }
    const rlpHeader         = createRLPHeader(web3, block);
    const rlpEncodedTx      = createRLPTransaction(web3, tx);
    const rlpEncodedReceipt = createRLPReceipt(txReceipt);

    const path = RLP.encode(tx.transactionIndex);
    const rlpEncodedTxNodes = await createTxMerkleProof(web3, block, tx.transactionIndex);
    const rlpEncodedReceiptNodes = await createReceiptMerkleProof(web3, block, tx.transactionIndex);
    return {
        rlpHeader,
        rlpEncodedTx,
        rlpEncodedReceipt,
        path,
        rlpEncodedTxNodes,
        rlpEncodedReceiptNodes
    };
};

const createTxMerkleProof = async (web3, block, transactionIndex) => {
    const trie = new Trie();

    for (let i=0; i<block.transactions.length; i++) {
        const tx = await web3.eth.getTransaction(block.transactions[i]);
        const rlpTx = createRLPTransaction(web3, tx);
        const key = RLP.encode(i);
        await trie.put(key, rlpTx);
    }

    const key = RLP.encode(transactionIndex);
    return RLP.encode(await Trie.createProof(trie, key));
};

const createReceiptMerkleProof = async (web3, block, transactionIndex) => {
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

const createRLPHeader = (web3, block) => {
    return RLP.encode([
        block.parentHash,
        block.sha3Uncles,
        block.miner,
        block.stateRoot,
        block.transactionsRoot,
        block.receiptsRoot,
        block.logsBloom,
        new web3.utils.BN(block.difficulty),
        new web3.utils.BN(block.number),
        block.gasLimit,
        block.gasUsed,
        block.timestamp,
        block.extraData,
        block.mixHash,
        block.nonce,
    ]);
};
const createRLPHeaderWithoutNonce = (web3, block) => {
    return RLP.encode([
        block.parentHash,
        block.sha3Uncles,
        block.miner,
        block.stateRoot,
        block.transactionsRoot,
        block.receiptsRoot,
        block.logsBloom,
        new web3.utils.BN(block.difficulty),
        new web3.utils.BN(block.number),
        block.gasLimit,
        block.gasUsed,
        block.timestamp,
        block.extraData,
    ]);
};

const createRLPTransaction = (web3, tx) => {
    const txData = {
      nonce: tx.nonce,
      gasPrice: web3.utils.toHex(new BN(tx.gasPrice)),
      gasLimit: tx.gas,
      to: tx.to,
      value: web3.utils.toHex(new BN(tx.value)),
      data: tx.input,
      v: tx.v,
      r: tx.r,
      s: tx.s
    };
    const transaction = new Transaction(txData);
    return transaction.serialize();
};

const createRLPReceipt = (receipt) => {
    return RLP.encode([
        // convert boolean to binary:
        // workaround until this pull request is merged: https://github.com/ethereumjs/rlp/pull/32
        receipt.status ? 1 : Buffer.from([0]),
        receipt.cumulativeGasUsed,
        receipt.logsBloom,
        convertLogs(receipt.logs)
    ]);
};

const convertLogs = (logs) => {
    const convertedLogs = [];
    for (const log of logs) {
        convertedLogs.push([
            log.address,
            log.topics,
            log.data
        ]);
    }
    return convertedLogs;
};

module.exports = {
    // calculateBlockHash,
    createProofData,
    // addToHex
};
