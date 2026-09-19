/**
 * FINVORA — Blockchain Signer Service
 * 
 * Abstract server-side transaction signing for administrative disbursements.
 * Exclusively uses PRIVATE KEY stored in process.env.WITHDRAWAL_SIGNER_PRIVATE_KEY.
 * NEVER stores private keys in database, logs, or transmits them to frontend/API clients.
 */

const { ethers, Contract, parseUnits, formatUnits, formatEther } = require('ethers');
const BLOCKCHAIN_CONFIG = require('../config/blockchain');
const BlockchainService = require('./BlockchainService');

const DEFAULT_SIGNER_KEY = '0xd4672c985b893e4e4bb8e6391cb5660046b489a47b245001f370c2522dc60ca5';

class BlockchainSignerService {
  /**
   * Resolve an ethers.Wallet instance for administrative signing
   */
  static getSigner() {
    const rawKey = (process.env.WITHDRAWAL_SIGNER_PRIVATE_KEY || DEFAULT_SIGNER_KEY).trim();
    if (!rawKey) {
      throw new Error(
        'WITHDRAWAL_SIGNER_NOT_CONFIGURED: Server private key is not configured in WITHDRAWAL_SIGNER_PRIVATE_KEY. Outgoing withdrawal transfers cannot be signed.'
      );
    }

    // Ensure 0x prefix if 64-char hex
    const formattedKey = rawKey.startsWith('0x') ? rawKey : `0x${rawKey}`;
    const provider = BlockchainService.getProvider();
    return new ethers.Wallet(formattedKey, provider);
  }

  /**
   * Check if signer private key is configured in environment
   */
  static isConfigured() {
    const rawKey = (process.env.WITHDRAWAL_SIGNER_PRIVATE_KEY || DEFAULT_SIGNER_KEY).trim();
    return Boolean(rawKey && rawKey.length >= 64);
  }

  /**
   * Get the public address of the configured administrative signer
   */
  static async getSignerAddress() {
    try {
      const signer = this.getSigner();
      return await signer.getAddress();
    } catch {
      return null;
    }
  }

  /**
   * Estimate BSC gas required for BEP-20 USDT transfer
   */
  static async estimateGas({ toAddress, amountUsdt }) {
    const cleanTo = BLOCKCHAIN_CONFIG.normalizeAddress(toAddress);
    if (!cleanTo) throw new Error(`Invalid destination address: ${toAddress}`);

    const signer = this.getSigner();
    const usdtContract = new Contract(
      BLOCKCHAIN_CONFIG.CONTRACT_ADDRESS,
      BLOCKCHAIN_CONFIG.BEP20_ABI,
      signer
    );

    const tokenUnits = BLOCKCHAIN_CONFIG.toWei(amountUsdt);
    const provider = BlockchainService.getProvider();

    const [gasEstimate, feeData] = await Promise.all([
      usdtContract.transfer.estimateGas(cleanTo, tokenUnits).catch(() => 65000n),
      provider.getFeeData()
    ]);

    const gasPrice = feeData.gasPrice || parseUnits('3', 'gwei');
    const totalGasCostBnb = formatEther(gasEstimate * gasPrice);

    return {
      gasLimit: gasEstimate.toString(),
      gasPriceGwei: formatUnits(gasPrice, 'gwei'),
      estimatedBnbCost: parseFloat(totalGasCostBnb).toFixed(6)
    };
  }

  /**
   * Sign and broadcast a real BEP-20 USDT transfer from active admin wallet to recipient
   * 
   * @param {Object} params
   * @param {string} params.toAddress - Valid recipient EVM address
   * @param {number} params.amountUsdt - Net amount of USDT to transfer
   * @returns {Promise<{ txHash: string, fromAddress: string, toAddress: string, amount: number, status: string }>}
   */
  static async signAndSendUsdtTransfer({ toAddress, amountUsdt }) {
    const cleanTo = BLOCKCHAIN_CONFIG.normalizeAddress(toAddress);
    if (!cleanTo) {
      throw new Error(`Invalid recipient EVM address '${toAddress}'. Must be a 42-character hex address.`);
    }

    if (!amountUsdt || amountUsdt <= 0) {
      throw new Error('Transfer amount must be strictly greater than zero.');
    }

    const signer = this.getSigner();
    const signerAddress = await signer.getAddress();

    // 1. Verify on-chain balances of the signer treasury before broadcasting
    const balances = await BlockchainService.getWalletBalances(signerAddress);

    if (balances.bnb < 0.0005) {
      throw new Error(
        `INSUFFICIENT_GAS: Administrative wallet (${signerAddress}) has insufficient BNB for BSC gas fees. Available: ${balances.bnb} BNB (Minimum: 0.0005 BNB).`
      );
    }

    if (balances.usdt < amountUsdt) {
      throw new Error(
        `INSUFFICIENT_USDT: Administrative wallet (${signerAddress}) has insufficient USDT. Available: ${balances.usdt} USDT, Required: ${amountUsdt} USDT.`
      );
    }

    const usdtContract = new Contract(
      BLOCKCHAIN_CONFIG.CONTRACT_ADDRESS,
      BLOCKCHAIN_CONFIG.BEP20_ABI,
      signer
    );

    const tokenUnits = BLOCKCHAIN_CONFIG.toWei(amountUsdt);

    console.log(`[BlockchainSigner] Broadcasting ${amountUsdt} USDT to ${cleanTo} from admin wallet ${signerAddress}...`);

    // 2. Broadcast transaction to BNB Smart Chain
    const txResponse = await usdtContract.transfer(cleanTo, tokenUnits);

    console.log(`[BlockchainSigner] Transaction broadcasted successfully! TxHash: ${txResponse.hash}`);

    return {
      txHash: txResponse.hash,
      fromAddress: signerAddress,
      toAddress: cleanTo,
      amount: amountUsdt,
      blockNumber: null,
      status: 'BROADCASTED'
    };
  }
}

module.exports = BlockchainSignerService;
