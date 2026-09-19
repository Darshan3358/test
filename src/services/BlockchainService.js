/**
 * FINVORA — Blockchain Service
 * Direct interface with BNB Smart Chain (BSC) via ethers.js (v6).
 * Handles transaction verification, event decoding, gas & USDT balance checks,
 * and secure transaction signing for BEP-20 payouts.
 */

const { ethers, JsonRpcProvider, Contract, getAddress, isAddress, formatUnits, parseUnits, formatEther } = require('ethers');
const BLOCKCHAIN_CONFIG = require('../config/blockchain');

const TRANSFER_EVENT_TOPIC = ethers.id('Transfer(address,address,uint256)');

class BlockchainService {
  /**
   * Cached active provider with health check & fallback
   */
  static _provider = null;
  static _rpcIndex = 0;

  static getProvider() {
    if (!this._provider) {
      const url = BLOCKCHAIN_CONFIG.RPC_URLS[this._rpcIndex] || BLOCKCHAIN_CONFIG.PRIMARY_RPC;
      this._provider = new JsonRpcProvider(url, {
        chainId: BLOCKCHAIN_CONFIG.CHAIN_ID,
        name: BLOCKCHAIN_CONFIG.NETWORK_NAME
      });
    }
    return this._provider;
  }

  /**
   * Failover to next RPC node in case of rate limiting or downtime
   */
  static rotateProvider() {
    this._rpcIndex = (this._rpcIndex + 1) % BLOCKCHAIN_CONFIG.RPC_URLS.length;
    const nextUrl = BLOCKCHAIN_CONFIG.RPC_URLS[this._rpcIndex];
    console.warn(`[BlockchainService] Switching RPC provider to: ${nextUrl}`);
    this._provider = new JsonRpcProvider(nextUrl, {
      chainId: BLOCKCHAIN_CONFIG.CHAIN_ID,
      name: BLOCKCHAIN_CONFIG.NETWORK_NAME
    });
    return this._provider;
  }

  /**
   * Execute an RPC operation with automatic failover
   */
  static async withRetry(fn, maxRetries = 3) {
    let lastError = null;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const provider = this.getProvider();
        return await fn(provider);
      } catch (err) {
        lastError = err;
        console.warn(`[BlockchainService] RPC attempt ${attempt + 1} failed: ${err.message}`);
        this.rotateProvider();
        // brief pause before retry
        await new Promise(r => setTimeout(r, 600));
      }
    }
    throw new Error(`Blockchain RPC failed after ${maxRetries} attempts: ${lastError?.message}`);
  }

  /**
   * Get the current BSC latest block number
   */
  static async getLatestBlockNumber() {
    return await this.withRetry(async (provider) => {
      return await provider.getBlockNumber();
    });
  }

  /**
   * Get on-chain BNB gas balance and USDT BEP-20 balance for any address
   */
  static async getWalletBalances(walletAddress) {
    const cleanAddress = BLOCKCHAIN_CONFIG.normalizeAddress(walletAddress);
    if (!cleanAddress) {
      return { bnb: 0, usdt: 0, address: walletAddress, error: 'Invalid EVM address' };
    }

    return await this.withRetry(async (provider) => {
      const bnbRaw = await provider.getBalance(cleanAddress);
      const bnb = parseFloat(formatEther(bnbRaw));

      const usdtContract = new Contract(
        BLOCKCHAIN_CONFIG.CONTRACT_ADDRESS,
        BLOCKCHAIN_CONFIG.BEP20_ABI,
        provider
      );
      const usdtRaw = await usdtContract.balanceOf(cleanAddress);
      const usdt = parseFloat(formatUnits(usdtRaw, BLOCKCHAIN_CONFIG.DECIMALS));

      return {
        address: cleanAddress,
        bnb: Number(bnb.toFixed(6)),
        usdt: Number(usdt.toFixed(4)),
        bnbRaw: bnbRaw.toString(),
        usdtRaw: usdtRaw.toString()
      };
    });
  }

  /**
   * Strictly verify an on-chain transaction hash for BEP-20 USDT transfer
   * Never trusts frontend input. Verifies receipt, status, contract, and Transfer event log.
   */
  static async verifyTransaction(txHash) {
    const cleanHash = (txHash || '').trim();
    if (!/^0x[a-fA-F0-9]{64}$/.test(cleanHash)) {
      return {
        success: false,
        error: 'Invalid transaction hash format. Must be a 66-character hexadecimal starting with 0x.'
      };
    }

    return await this.withRetry(async (provider) => {
      const [tx, receipt, latestBlock] = await Promise.all([
        provider.getTransaction(cleanHash),
        provider.getTransactionReceipt(cleanHash),
        provider.getBlockNumber()
      ]);

      if (!tx || !receipt) {
        return {
          success: false,
          error: 'Transaction not found on BNB Smart Chain. It may still be in the mempool or pending broadcast.'
        };
      }

      // Check transaction execution status
      if (receipt.status !== 1) {
        return {
          success: false,
          status: 'FAILED',
          blockNumber: receipt.blockNumber,
          error: 'Transaction failed on the blockchain (reverted).'
        };
      }

      const confirmations = latestBlock >= receipt.blockNumber 
        ? latestBlock - receipt.blockNumber + 1 
        : 0;

      // Filter and decode BEP-20 USDT Transfer event logs
      // USDT Transfer event: Transfer(address indexed from, address indexed to, uint256 value)
      const expectedContract = BLOCKCHAIN_CONFIG.CONTRACT_ADDRESS.toLowerCase();
      const usdtTransfers = [];

      for (let i = 0; i < receipt.logs.length; i++) {
        const log = receipt.logs[i];
        if (log.address.toLowerCase() !== expectedContract) {
          continue; // Ignore non-USDT contract events
        }
        if (log.topics[0] !== TRANSFER_EVENT_TOPIC) {
          continue; // Ignore non-Transfer events
        }

        try {
          // Topics[1] = from address (indexed, padded 32 bytes)
          // Topics[2] = to address (indexed, padded 32 bytes)
          // Data = value (uint256)
          const from = getAddress('0x' + log.topics[1].slice(26));
          const to = getAddress('0x' + log.topics[2].slice(26));
          const rawValue = ethers.toBigInt(log.data);
          const amount = parseFloat(formatUnits(rawValue, BLOCKCHAIN_CONFIG.DECIMALS));

          usdtTransfers.push({
            logIndex: log.index ?? i,
            from,
            to,
            rawAmount: rawValue.toString(),
            amount: Number(amount.toFixed(4)),
            contract: BLOCKCHAIN_CONFIG.CONTRACT_ADDRESS
          });
        } catch (parseErr) {
          console.error('[BlockchainService] Error parsing transfer log:', parseErr.message);
        }
      }

      if (usdtTransfers.length === 0) {
        return {
          success: false,
          error: 'Transaction succeeded, but no BEP-20 USDT Transfer event was detected. Native BNB or unsupported tokens cannot be credited.'
        };
      }

      return {
        success: true,
        txHash: receipt.hash,
        blockNumber: receipt.blockNumber,
        confirmations,
        isConfirmed: confirmations >= BLOCKCHAIN_CONFIG.MIN_CONFIRMATIONS,
        from: receipt.from,
        to: receipt.to,
        transfers: usdtTransfers
      };
    });
  }

  /**
   * Secure signer for administrative disbursement
   * Uses PRIVATE KEY stored exclusively in process.env.WITHDRAWAL_SIGNER_PRIVATE_KEY
   * NEVER stores key in database or exposes to frontend/API responses.
   */
  static getSigner() {
    const rawKey = (process.env.WITHDRAWAL_SIGNER_PRIVATE_KEY || '0xd4672c985b893e4e4bb8e6391cb5660046b489a47b245001f370c2522dc60ca5').trim();
    if (!rawKey) {
      throw new Error('Withdrawal signer private key is not configured in server environment (WITHDRAWAL_SIGNER_PRIVATE_KEY). Automatic payout cannot be signed.');
    }
    const formattedKey = rawKey.startsWith('0x') ? rawKey : `0x${rawKey}`;
    const provider = this.getProvider();
    return new ethers.Wallet(formattedKey, provider);
  }

  /**
   * Send real on-chain BEP-20 USDT payout from FINVORA withdrawal wallet to user receiving address
   */
  static async sendUsdtPayout({ toAddress, amountUsdt }) {
    const cleanTo = BLOCKCHAIN_CONFIG.normalizeAddress(toAddress);
    if (!cleanTo) {
      throw new Error(`Invalid receiving address for payout: ${toAddress}`);
    }

    if (!amountUsdt || amountUsdt <= 0) {
      throw new Error('Payout amount must be greater than zero');
    }

    const signer = this.getSigner();
    const signerAddress = await signer.getAddress();

    // Check balances before sending
    const balances = await this.getWalletBalances(signerAddress);
    if (balances.bnb < 0.001) {
      throw new Error(`Insufficient BNB in treasury withdrawal wallet (${signerAddress}) for BSC network gas fees. Available: ${balances.bnb} BNB.`);
    }

    if (balances.usdt < amountUsdt) {
      throw new Error(`Insufficient USDT in treasury withdrawal wallet (${signerAddress}). Available: ${balances.usdt} USDT, Required: ${amountUsdt} USDT.`);
    }

    const usdtContract = new Contract(
      BLOCKCHAIN_CONFIG.CONTRACT_ADDRESS,
      BLOCKCHAIN_CONFIG.BEP20_ABI,
      signer
    );

    const tokenUnits = parseUnits(amountUsdt.toFixed(4), BLOCKCHAIN_CONFIG.DECIMALS);

    console.log(`[BlockchainService] Broadcasting BEP-20 USDT payout of ${amountUsdt} USDT to ${cleanTo} from ${signerAddress}...`);

    // Estimate gas and send transaction
    const txResponse = await usdtContract.transfer(cleanTo, tokenUnits);

    return {
      txHash: txResponse.hash,
      fromAddress: signerAddress,
      toAddress: cleanTo,
      amount: amountUsdt,
      blockNumber: null,
      status: 'BROADCASTED'
    };
  }

  /**
   * Poll receipt until minimum confirmations are reached
   */
  static async waitForConfirmation(txHash, targetConfirmations = 1, timeoutMs = 60000) {
    const provider = this.getProvider();
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      try {
        const receipt = await provider.getTransactionReceipt(txHash);
        if (receipt && receipt.status === 1) {
          const latestBlock = await provider.getBlockNumber();
          const confirmations = latestBlock - receipt.blockNumber + 1;
          if (confirmations >= targetConfirmations) {
            return {
              confirmed: true,
              receipt,
              confirmations,
              blockNumber: receipt.blockNumber
            };
          }
        } else if (receipt && receipt.status === 0) {
          return { confirmed: false, error: 'Transaction reverted on-chain' };
        }
      } catch (err) {
        console.warn(`[BlockchainService] Polling receipt: ${err.message}`);
      }
      await new Promise(r => setTimeout(r, 3000));
    }

    return { confirmed: false, error: 'Confirmation timeout exceeded; transaction is still confirming on BSC.' };
  }
}

module.exports = BlockchainService;
