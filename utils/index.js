const RLP = require('rlp');
const Web3 = require('web3');
const web3 = new Web3(Web3.givenProvider || 'https://mainnet.infura.io', null, {});
const BN = web3.utils.BN;
const {Transaction} = require('ethereumjs-tx');

const createRLPHeader = (block) => {
    return RLP.encode([
        block.parentHash,
        block.sha3Uncles,
        block.miner,
        block.stateRoot,
        block.transactionsRoot,
        block.receiptsRoot,
        block.logsBloom,
        new BN(block.difficulty),
        new BN(block.number),
        block.gasLimit,
        block.gasUsed,
        block.timestamp,
        block.extraData,
        block.mixHash,
        block.nonce,
    ]);
};
const createRLPHeaderWithoutNonce = (block) => {
    return RLP.encode([
        block.parentHash,
        block.sha3Uncles,
        block.miner,
        block.stateRoot,
        block.transactionsRoot,
        block.receiptsRoot,
        block.logsBloom,
        new BN(block.difficulty),
        new BN(block.number),
        block.gasLimit,
        block.gasUsed,
        block.timestamp,
        block.extraData,
    ]);
};

const createRLPTransaction = (tx) => {
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
    createRLPHeader,
    createRLPHeaderWithoutNonce,
    createRLPTransaction,
    createRLPReceipt,
    // addToHex
};
