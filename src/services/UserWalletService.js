/**
 * FINVORA — User Wallet Service
 * 
 * Manages user cryptographic wallet connections on BNB Smart Chain.
 * Enforces one active verified wallet per user, server-side nonce verification (ethers.verifyMessage),
 * and safeguards against destination switching during pending withdrawals.
 */

const { ethers } = require('ethers');
const crypto = require('crypto');
const { db, query, get, run, transaction } = require('../database/db');
const BLOCKCHAIN_CONFIG = require('../config/blockchain');
const BlockchainService = require('./BlockchainService');
const WalletService = require('./WalletService');

// In-memory or cache store for active nonces
const userNonceStore = new Map();

class UserWalletService {
  /**
   * Get the current active verified wallet for a user
   */
  static getActiveWallet(userId) {
    if (!userId) return null;
    const row = get(`
      SELECT * FROM user_wallets 
      WHERE user_id = ? AND is_active = 1 AND is_verified = 1 
      ORDER BY id DESC LIMIT 1
    `, [userId]);

    if (!row) return null;

    return {
      id: row.id,
      userId: row.user_id,
      walletAddress: row.wallet_address,
      normalizedAddress: row.normalized_wallet_address || BLOCKCHAIN_CONFIG.normalizeAddress(row.wallet_address),
      network: row.network || 'BSC',
      chainId: row.chain_id || 56,
      isVerified: Boolean(row.is_verified),
      connectedAt: row.connected_at,
      lastVerifiedAt: row.last_verified_at
    };
  }

  /**
   * Generate a cryptographic verification nonce for a user
   */
  static generateNonce(userId) {
    if (!userId) throw new Error('User ID is required to generate nonce.');

    const nonce = crypto.randomBytes(16).toString('hex');
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes validity
    const message = `FINVORA Wallet Verification Nonce: ${nonce}`;

    userNonceStore.set(String(userId), {
      nonce,
      message,
      expiresAt: expiresAt.getTime()
    });

    // Update in database as well for persistence across server restarts
    run(`
      UPDATE user_wallets 
      SET nonce = ?, nonce_expires_at = datetime('now', '+5 minutes')
      WHERE user_id = ? AND is_active = 1
    `, [nonce, userId]);

    return {
      nonce,
      message,
      expiresAt: expiresAt.toISOString()
    };
  }

  /**
   * Cryptographically verify user's signature and set active primary wallet
   */
  static verifyAndConnectWallet({ userId, walletAddress, signature, chainId = 56 }) {
    if (!userId) throw new Error('User must be authenticated.');

    // 1. Enforce BNB Smart Chain (Chain ID 56)
    const numericChainId = parseInt(chainId, 10);
    if (numericChainId !== 56) {
      throw new Error(
        `UNSUPPORTED_NETWORK: FINVORA strictly operates on BNB Smart Chain (Chain ID: 56). Your wallet is connected to Chain ID: ${numericChainId}. Please switch network in your wallet.`
      );
    }

    const cleanAddress = BLOCKCHAIN_CONFIG.normalizeAddress(walletAddress);
    if (!cleanAddress) {
      throw new Error(`Invalid EVM address '${walletAddress}'. Address must be a 42-character hexadecimal starting with 0x.`);
    }

    if (!signature || typeof signature !== 'string') {
      throw new Error('Cryptographic signature is required to verify ownership of this wallet.');
    }

    // 2. Validate nonce
    const stored = userNonceStore.get(String(userId));
    let messageToVerify = stored ? stored.message : null;

    if (!stored || Date.now() > stored.expiresAt) {
      // Check database fallback
      const dbRow = get("SELECT nonce, nonce_expires_at FROM user_wallets WHERE user_id = ? AND nonce IS NOT NULL ORDER BY id DESC LIMIT 1", [userId]);
      if (dbRow && dbRow.nonce) {
        messageToVerify = `FINVORA Wallet Verification Nonce: ${dbRow.nonce}`;
      } else {
        throw new Error('Verification session has expired or was not initialized. Please click Connect Wallet again.');
      }
    }

    // 3. Recover signer address from personal_sign message
    let recoveredAddress;
    try {
      recoveredAddress = ethers.verifyMessage(messageToVerify, signature);
    } catch (sigErr) {
      throw new Error(`Cryptographic signature verification failed: ${sigErr.message}`);
    }

    const normalizedRecovered = BLOCKCHAIN_CONFIG.normalizeAddress(recoveredAddress);
    if (!normalizedRecovered || normalizedRecovered.toLowerCase() !== cleanAddress.toLowerCase()) {
      throw new Error(
        `SIGNATURE_MISMATCH: The signed message was signed by ${recoveredAddress}, which does not match the submitted wallet ${cleanAddress}.`
      );
    }

    // Consume nonce to prevent replay
    userNonceStore.delete(String(userId));

    return transaction(() => {
      // 4. Check previous wallet
      const existingWallet = get("SELECT * FROM user_wallets WHERE user_id = ? AND is_active = 1", [userId]);
      const isSwitching = existingWallet && existingWallet.wallet_address.toLowerCase() !== cleanAddress.toLowerCase();

      // If user is switching wallets while having pending withdrawals, flag them as REVIEW_REQUIRED
      if (isSwitching) {
        const pendingWithdrawals = query(
          "SELECT id, withdrawal_code FROM withdrawals WHERE user_id = ? AND status IN ('PENDING', 'PENDING_ADMIN_APPROVAL')",
          [userId]
        );

        if (pendingWithdrawals.length > 0) {
          for (const pw of pendingWithdrawals) {
            run(`
              UPDATE withdrawals 
              SET status = 'REVIEW_REQUIRED',
                  admin_note = COALESCE(admin_note || ' | ', '') || 'User changed verified wallet address while withdrawal was pending.'
              WHERE id = ?
            `, [pw.id]);
            console.warn(`[UserWalletService] Withdrawal #${pw.withdrawal_code} flagged as REVIEW_REQUIRED due to wallet address change.`);
          }
        }
      }

      // 5. Deactivate all existing wallets for this user
      run(`
        UPDATE user_wallets 
        SET is_active = 0, disconnected_at = CURRENT_TIMESTAMP 
        WHERE user_id = ? AND is_active = 1
      `, [userId]);

      // 6. Insert new active verified wallet
      const res = run(`
        INSERT INTO user_wallets (
          user_id, wallet_address, normalized_wallet_address, network, chain_id,
          is_verified, is_active, connected_at, last_verified_at, nonce, nonce_expires_at
        ) VALUES (?, ?, ?, 'BSC', 56, 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL, NULL)
      `, [userId, cleanAddress, cleanAddress]);

      console.log(`[UserWalletService] User #${userId} successfully connected and verified wallet: ${cleanAddress}`);

      return {
        success: true,
        walletId: res.lastInsertRowid,
        walletAddress: cleanAddress,
        network: 'BSC',
        chainId: 56,
        isVerified: true
      };
    });
  }

  /**
   * Disconnect user's active wallet
   */
  static disconnectWallet(userId) {
    if (!userId) return { success: false, error: 'User not authenticated' };

    run(`
      UPDATE user_wallets 
      SET is_active = 0, disconnected_at = CURRENT_TIMESTAMP 
      WHERE user_id = ? AND is_active = 1
    `, [userId]);

    userNonceStore.delete(String(userId));

    return {
      success: true,
      message: 'Wallet disconnected successfully.'
    };
  }

  /**
   * Get user wallet status: verified address + on-chain balances + internal ledger balances
   */
  static async getUserWalletStatus(userId) {
    const activeWallet = this.getActiveWallet(userId);
    let onChainBalances = { bnb: 0, usdt: 0 };

    if (activeWallet && activeWallet.walletAddress) {
      try {
        onChainBalances = await BlockchainService.getWalletBalances(activeWallet.walletAddress);
      } catch (err) {
        console.warn(`[UserWalletService] Failed to fetch on-chain balances for ${activeWallet.walletAddress}:`, err.message);
      }
    }

    const internalWallet = WalletService.getWallet(userId);

    return {
      isConnected: Boolean(activeWallet),
      walletAddress: activeWallet ? activeWallet.walletAddress : null,
      isVerified: Boolean(activeWallet?.isVerified),
      lastVerifiedAt: activeWallet?.lastVerifiedAt || null,
      connectedAt: activeWallet?.connectedAt || null,
      network: 'BSC',
      chainId: 56,
      token: 'USDT',
      onChainBalances: {
        bnb: onChainBalances.bnb || 0,
        usdt: onChainBalances.usdt || 0
      },
      internalBalances: {
        mainBalance: internalWallet.main_balance || 0,
        roiBalance: internalWallet.roi_balance || 0,
        referralBalance: internalWallet.referral_balance || 0,
        levelBalance: internalWallet.level_balance || 0,
        salaryBalance: internalWallet.salary_balance || 0,
        withdrawableProfit: internalWallet.withdrawable_profit || 0,
        totalWithdrawn: internalWallet.total_withdrawn || 0
      }
    };
  }
}

module.exports = UserWalletService;
