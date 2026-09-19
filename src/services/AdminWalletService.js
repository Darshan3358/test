/**
 * FINVORA — Admin Wallet Service
 * 
 * Enforces the Single Active Admin Wallet architecture (Section 11):
 * FINVORA uses ONLY ONE ACTIVE ADMIN WALLET for both incoming deposits and outgoing withdrawals.
 * Supports Web3 signature verification (ethers.verifyMessage) for wallet activation.
 */

const { ethers, isAddress, getAddress } = require('ethers');
const crypto = require('crypto');
const { db, query, get, run, transaction } = require('../database/db');
const BLOCKCHAIN_CONFIG = require('../config/blockchain');
const BlockchainService = require('./BlockchainService');
const AuditService = require('./AuditService');

// In-memory or fallback nonce tracking for admin verification sessions
const adminNonceStore = new Map();

class AdminWalletService {
  /**
   * Get the single active common FINVORA admin wallet
   * 1. Check in-memory cache
   * 2. Fallback to process.env (ACTIVE_ADMIN_WALLET / ACTIVE_DEPOSIT_WALLET / ACTIVE_WITHDRAWAL_WALLET)
   */
  static getActiveAdminWallet() {
    if (global._finvoraActiveAdminWallet) {
      return global._finvoraActiveAdminWallet;
    }

    const envWallet = (
      process.env.ACTIVE_ADMIN_WALLET ||
      process.env.ACTIVE_DEPOSIT_WALLET ||
      process.env.ACTIVE_WITHDRAWAL_WALLET ||
      ''
    ).trim();

    return BLOCKCHAIN_CONFIG.normalizeAddress(envWallet) || '';
  }

  /**
   * Refresh the active admin wallet from MongoDB Atlas
   */
  static async refreshActiveAdminWallet() {
    try {
      const { getDb } = require('../database/mongo');
      const db = getDb();
      if (db) {
        const row = await db.collection('admin_wallets').findOne(
          { is_active: 1 },
          { sort: { id: -1, _id: -1 } }
        );
        if (row && row.wallet_address) {
          const normalized = BLOCKCHAIN_CONFIG.normalizeAddress(row.wallet_address);
          if (normalized) {
            global._finvoraActiveAdminWallet = normalized;
            return normalized;
          }
        }
      }
    } catch (err) {
      console.warn('[AdminWalletService] Error refreshing active admin wallet:', err.message);
    }
    return this.getActiveAdminWallet();
  }

  /**
   * Alias for backward compatibility - Deposit Wallet
   */
  static getActiveDepositWallet() {
    return this.getActiveAdminWallet();
  }

  /**
   * Alias for backward compatibility - Withdrawal Wallet
   */
  static getActiveWithdrawalWallet() {
    return this.getActiveAdminWallet();
  }

  /**
   * Check if an address is currently or was historically a FINVORA admin wallet
   */
  static isDepositWallet(address) {
    if (!address) return false;
    const clean = BLOCKCHAIN_CONFIG.normalizeAddress(address);
    if (!clean) return false;

    // Check active
    const active = this.getActiveAdminWallet();
    if (active && active.toLowerCase() === clean.toLowerCase()) return true;

    // Check all historical
    const hist = query("SELECT wallet_address FROM admin_wallets");
    for (const h of hist) {
      if (h.wallet_address && h.wallet_address.toLowerCase() === clean.toLowerCase()) return true;
    }

    const arch = query("SELECT wallet_address FROM admin_wallet_history");
    for (const a of arch) {
      if (a.wallet_address && a.wallet_address.toLowerCase() === clean.toLowerCase()) return true;
    }

    return false;
  }

  /**
   * Generate a cryptographic verification nonce for an admin
   */
  static generateAdminNonce(adminId = 0) {
    const nonce = crypto.randomBytes(16).toString('hex');
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes validity
    const message = `FINVORA Admin Wallet Verification Nonce: ${nonce}`;

    adminNonceStore.set(String(adminId), {
      nonce,
      message,
      expiresAt: expiresAt.getTime()
    });

    return {
      nonce,
      message,
      expiresAt: expiresAt.toISOString()
    };
  }

  /**
   * Cryptographically verify admin signature and activate the wallet in database
   * (Matches user wallet connect flow - personal_sign verification via Web3)
   */
  static verifyAndSetActiveWallet({ adminId = 0, adminName = 'Admin', walletAddress, signature, ipAddress = null }) {
    const cleanAddress = BLOCKCHAIN_CONFIG.normalizeAddress(walletAddress);
    if (!cleanAddress) {
      throw new Error(`Invalid EVM address '${walletAddress}'. Must be a 42-character valid hex address starting with 0x.`);
    }

    if (!signature || typeof signature !== 'string') {
      throw new Error('Cryptographic signature is required to verify wallet authorization.');
    }

    // Retrieve pending nonce for this admin
    const stored = adminNonceStore.get(String(adminId));
    if (!stored || Date.now() > stored.expiresAt) {
      adminNonceStore.delete(String(adminId));
      throw new Error('Verification nonce has expired or was not requested. Please request a new nonce.');
    }

    // Recover signer from message
    let recoveredAddress;
    try {
      recoveredAddress = ethers.verifyMessage(stored.message, signature);
    } catch (err) {
      throw new Error(`Cryptographic signature verification failed: ${err.message}`);
    }

    const normalizedRecovered = BLOCKCHAIN_CONFIG.normalizeAddress(recoveredAddress);
    if (!normalizedRecovered || normalizedRecovered.toLowerCase() !== cleanAddress.toLowerCase()) {
      throw new Error(
        `Signature mismatch! Recovered signer '${recoveredAddress}' does not match provided address '${cleanAddress}'.`
      );
    }

    // Consume nonce to prevent replay attacks
    adminNonceStore.delete(String(adminId));

    return transaction(() => {
      // Find current active wallet
      const currentActive = get("SELECT * FROM admin_wallets WHERE is_active = 1 ORDER BY id DESC LIMIT 1");
      const oldAddress = currentActive ? currentActive.wallet_address : null;

      // Deactivate all existing admin wallets
      run("UPDATE admin_wallets SET is_active = 0, deactivated_at = CURRENT_TIMESTAMP WHERE is_active = 1");

      if (currentActive && oldAddress && oldAddress.toLowerCase() !== cleanAddress.toLowerCase()) {
        run(`
          INSERT INTO admin_wallet_history (
            wallet_type, wallet_address, normalized_wallet_address, network, token, status, created_by, created_at, deactivated_at
          ) VALUES ('COMMON', ?, ?, 'BSC', 'USDT', 'HISTORICAL', ?, ?, CURRENT_TIMESTAMP)
        `, [currentActive.wallet_address, currentActive.normalized_wallet_address || currentActive.wallet_address, adminId, currentActive.created_at]);
      }

      // Check user exists for foreign key
      const userExists = adminId ? get("SELECT id FROM users WHERE id = ?", [adminId]) : null;
      const effectiveAdminId = userExists ? userExists.id : null;

      // Insert new active wallet
      const res = run(`
        INSERT INTO admin_wallets (
          wallet_type, wallet_address, normalized_wallet_address, network, token, chain_id,
          is_active, last_verified_at, created_by, created_at
        ) VALUES ('COMMON', ?, ?, 'BSC', 'USDT', 56, 1, CURRENT_TIMESTAMP, ?, CURRENT_TIMESTAMP)
      `, [cleanAddress, cleanAddress, effectiveAdminId]);

      // Create security audit log
      AuditService.log({
        actorId: adminId,
        actorName: adminName,
        actorRole: 'ADMIN',
        action: 'SET_ACTIVE_ADMIN_WALLET',
        targetType: 'ADMIN_WALLET',
        targetId: res.lastInsertRowid,
        details: {
          walletType: 'COMMON',
          oldAddress,
          newAddress: cleanAddress,
          network: 'BSC',
          token: 'USDT',
          chainId: 56,
          verifiedVia: 'PERSONAL_SIGN'
        },
        ipAddress
      });

      console.log(`[AdminWalletService] Successfully activated admin wallet: ${cleanAddress} (Verified by ${adminName})`);

      return {
        success: true,
        walletAddress: cleanAddress,
        oldAddress,
        verifiedAt: new Date().toISOString()
      };
    });
  }

  /**
   * Manually update the single active admin wallet (Disabled - Web3 Connect Only)
   */
  static updateActiveWallet() {
    throw new Error('Manual wallet address updates are disabled. Please connect or switch the admin wallet securely via Web3.');
  }

  /**
   * Disconnect the active admin wallet
   */
  static disconnectActiveWallet({ adminId = 0, adminName = 'Admin', ipAddress = null } = {}) {
    return transaction(() => {
      const currentActive = get("SELECT * FROM admin_wallets WHERE is_active = 1 ORDER BY id DESC LIMIT 1");
      if (!currentActive) {
        return { success: true, message: 'No active admin wallet was connected.' };
      }

      run("UPDATE admin_wallets SET is_active = 0, deactivated_at = CURRENT_TIMESTAMP WHERE id = ?", [currentActive.id]);

      AuditService.log({
        actorId: adminId,
        actorName: adminName,
        actorRole: 'ADMIN',
        action: 'DISCONNECT_ADMIN_WALLET',
        targetType: 'ADMIN_WALLET',
        targetId: currentActive.id,
        details: {
          walletAddress: currentActive.wallet_address
        },
        ipAddress
      });

      return {
        success: true,
        disconnectedAddress: currentActive.wallet_address
      };
    });
  }

  /**
   * Get comprehensive status for the single active admin wallet
   * Includes on-chain BNB and USDT balances
   */
  static async getAdminWalletStatus() {
    const activeAddress = this.getActiveAdminWallet();
    const activeRow = get("SELECT * FROM admin_wallets WHERE is_active = 1 ORDER BY id DESC LIMIT 1");

    let balances = { bnb: 0, usdt: 0 };
    if (activeAddress) {
      try {
        balances = await BlockchainService.getWalletBalances(activeAddress);
      } catch (err) {
        console.warn('[AdminWalletService] Balance fetch warning:', err.message);
      }
    }

    const historical = query("SELECT * FROM admin_wallet_history ORDER BY id DESC LIMIT 20");

    return {
      activeWallet: activeAddress,
      isVerified: Boolean(activeRow?.last_verified_at),
      lastVerifiedAt: activeRow?.last_verified_at || null,
      connectedAt: activeRow?.created_at || null,
      network: 'BSC',
      chainId: 56,
      token: 'USDT',
      onChainBalances: {
        bnb: balances.bnb || 0,
        usdt: balances.usdt || 0,
        isBnbLow: (balances.bnb || 0) < 0.002,
        isUsdtLow: (balances.usdt || 0) < 50
      },
      history: historical
    };
  }

  /**
   * Get all active and historical wallets
   */
  static getWalletHistory() {
    const active = query("SELECT * FROM admin_wallets ORDER BY id DESC");
    const historical = query("SELECT * FROM admin_wallet_history ORDER BY id DESC");
    return {
      active,
      historical
    };
  }
}

module.exports = AdminWalletService;
