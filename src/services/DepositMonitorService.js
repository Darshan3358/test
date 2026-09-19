/**
 * FINVORA — Deposit Monitor & Blockchain Verification Service
 * Handles deposit requests, on-chain USDT BEP-20 verification,
 * common-wallet accounting matching, duplicate protection, and block scanning.
 */

const { db, query, get, run, transaction } = require('../database/db');
const BLOCKCHAIN_CONFIG = require('../config/blockchain');
const BlockchainService = require('./BlockchainService');
const AdminWalletService = require('./AdminWalletService');
const WalletService = require('./WalletService');
const AuditService = require('./AuditService');

class DepositMonitorService {
  /**
   * Create a new deposit request for a user
   */
  static createDepositRequest({ userId, amount }) {
    if (!amount || amount <= 0) {
      throw new Error('Deposit amount must be greater than zero.');
    }

    const expectedAmount = Number(parseFloat(amount).toFixed(4));
    if (expectedAmount < 10) {
      throw new Error('Minimum deposit amount is 10 USDT.');
    }

    const activeWallet = AdminWalletService.getActiveDepositWallet();
    const depositCode = WalletService.generateTxCode('DEP');

    const res = run(`
      INSERT INTO deposit_requests (
        deposit_code, user_id, expected_amount, active_deposit_wallet,
        network, token, status
      ) VALUES (?, ?, ?, ?, 'BSC', 'USDT', 'PENDING')
    `, [depositCode, userId, expectedAmount, activeWallet]);

    // Also mirror into existing deposits table for backward compatibility with UI
    run(`
      INSERT INTO deposits (
        deposit_code, user_id, amount, payment_method, status
      ) VALUES (?, ?, ?, 'USDT_BEP20', 'PENDING')
    `, [depositCode, userId, expectedAmount]);

    return {
      depositId: res.lastInsertRowid,
      depositCode,
      expectedAmount,
      activeDepositWallet: activeWallet,
      network: 'BNB Smart Chain (BEP-20)',
      token: 'USDT',
      status: 'PENDING',
      createdAt: new Date().toISOString()
    };
  }

  /**
   * Automatically verify a user-submitted transaction hash on BSC
   * Strictly verifies on-chain evidence: existence, success, chain, contract,
   * Transfer event, recipient, expected amount, confirmations, and duplicate check.
   */
  static async verifyDeposit({ userId, depositRequestId = null, depositCode = null, txHash }) {
    const cleanHash = (txHash || '').trim();
    if (!/^0x[a-fA-F0-9]{64}$/.test(cleanHash)) {
      throw new Error('Invalid transaction hash format. Please provide a valid 66-character hex hash starting with 0x.');
    }

    // 1. Check duplicate replay protection
    const alreadyCredited = get("SELECT * FROM blockchain_deposit_transfers WHERE tx_hash = ?", [cleanHash]);
    if (alreadyCredited) {
      return {
        success: false,
        status: 'ALREADY_PROCESSED',
        message: 'This blockchain transaction has already been verified and credited. Duplicate submissions are strictly prevented.'
      };
    }

    // 2. Fetch the corresponding pending deposit request
    let depReq = null;
    if (depositRequestId) {
      depReq = get("SELECT * FROM deposit_requests WHERE id = ? AND user_id = ?", [depositRequestId, userId]);
    } else if (depositCode) {
      depReq = get("SELECT * FROM deposit_requests WHERE deposit_code = ? AND user_id = ?", [depositCode, userId]);
    } else {
      // Find latest pending request for this user
      depReq = get("SELECT * FROM deposit_requests WHERE user_id = ? AND status = 'PENDING' ORDER BY id DESC LIMIT 1", [userId]);
    }

    // 3. Query the blockchain for on-chain receipt and event logs
    const onChainResult = await BlockchainService.verifyTransaction(cleanHash);
    if (!onChainResult.success) {
      return {
        success: false,
        status: onChainResult.status || 'VERIFICATION_FAILED',
        message: onChainResult.error || 'Failed to verify transaction on BNB Smart Chain.'
      };
    }

    // Save transaction to raw blockchain_transactions log
    try {
      run(`
        INSERT OR IGNORE INTO blockchain_transactions (
          tx_hash, chain_id, block_number, from_address, to_address, status, raw_data
        ) VALUES (?, ?, ?, ?, ?, 'VERIFIED', ?)
      `, [cleanHash, BLOCKCHAIN_CONFIG.CHAIN_ID, onChainResult.blockNumber, onChainResult.from, onChainResult.to, JSON.stringify(onChainResult.transfers)]);
    } catch (e) {
      // Ignore unique constraint error if already logged
    }

    // 4. Find valid USDT Transfer to a FINVORA deposit wallet
    let matchedTransfer = null;
    let wrongAmountTransfer = null;

    for (const transfer of onChainResult.transfers) {
      const isFinvoraRecipient = AdminWalletService.isDepositWallet(transfer.to);
      if (!isFinvoraRecipient) {
        continue;
      }

      // If we have a deposit request, check expected amount
      if (depReq) {
        const diff = Math.abs(transfer.amount - depReq.expected_amount);
        if (diff < 0.0001) {
          matchedTransfer = transfer;
          break;
        } else {
          wrongAmountTransfer = transfer;
        }
      } else {
        // No specific request, match first transfer to FINVORA
        matchedTransfer = transfer;
        break;
      }
    }

    // If transfer went to FINVORA but amount mismatched
    if (!matchedTransfer && wrongAmountTransfer) {
      // Record as UNMATCHED for administrative review
      try {
        run(`
          INSERT OR IGNORE INTO blockchain_deposits (
            deposit_request_id, user_id, tx_hash, from_address, to_address,
            token_contract, amount, block_number, confirmation_count, status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'UNMATCHED')
        `, [
          depReq ? depReq.id : null,
          userId,
          cleanHash,
          wrongAmountTransfer.from,
          wrongAmountTransfer.to,
          wrongAmountTransfer.contract,
          wrongAmountTransfer.amount,
          onChainResult.blockNumber,
          onChainResult.confirmations
        ]);
      } catch (e) {}

      return {
        success: false,
        status: 'UNMATCHED',
        message: `Transaction detected with amount of ${wrongAmountTransfer.amount} USDT, but expected ${depReq.expected_amount} USDT. Logged as UNMATCHED for admin review.`
      };
    }

    if (!matchedTransfer) {
      return {
        success: false,
        status: 'UNSUPPORTED_ASSET',
        message: 'No valid BEP-20 USDT transfer to the official FINVORA deposit wallet was found in this transaction.'
      };
    }

    // 5. Execute atomic deposit verification and credit user wallet
    return transaction(() => {
      // Double check transfer log unique constraint inside transaction
      const doubleCheck = get("SELECT * FROM blockchain_deposit_transfers WHERE tx_hash = ? AND log_index = ?", [
        cleanHash,
        matchedTransfer.logIndex
      ]);
      if (doubleCheck) {
        return {
          success: false,
          status: 'ALREADY_PROCESSED',
          message: 'This transaction transfer log has already been credited.'
        };
      }

      // Record transfer in blockchain_deposit_transfers
      run(`
        INSERT INTO blockchain_deposit_transfers (
          tx_hash, log_index, from_address, to_address, token_contract, amount, block_number, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'PROCESSED')
      `, [
        cleanHash,
        matchedTransfer.logIndex,
        matchedTransfer.from,
        matchedTransfer.to,
        matchedTransfer.contract,
        matchedTransfer.amount,
        onChainResult.blockNumber
      ]);

      // Record in blockchain_deposits
      run(`
        INSERT INTO blockchain_deposits (
          deposit_request_id, user_id, tx_hash, from_address, to_address,
          token_contract, amount, block_number, confirmation_count, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'VERIFIED')
      `, [
        depReq ? depReq.id : null,
        userId,
        cleanHash,
        matchedTransfer.from,
        matchedTransfer.to,
        matchedTransfer.contract,
        matchedTransfer.amount,
        onChainResult.blockNumber,
        onChainResult.confirmations
      ]);

      // Update deposit_requests
      const depCode = depReq ? depReq.deposit_code : WalletService.generateTxCode('DEP');
      if (depReq) {
        run(`
          UPDATE deposit_requests
          SET status = 'CONFIRMED', tx_hash = ?, confirmed_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `, [cleanHash, depReq.id]);

        // Sync with legacy deposits table
        run(`
          UPDATE deposits
          SET status = 'APPROVED', transaction_reference = ?, processed_at = CURRENT_TIMESTAMP, admin_note = 'Auto-verified on BSC Mainnet'
          WHERE deposit_code = ?
        `, [cleanHash, depReq.deposit_code]);
      } else {
        run(`
          INSERT INTO deposits (
            deposit_code, user_id, amount, payment_method, transaction_reference, status, processed_at, admin_note
          ) VALUES (?, ?, ?, 'USDT_BEP20', ?, 'APPROVED', CURRENT_TIMESTAMP, 'Auto-verified on BSC Mainnet')
        `, [depCode, userId, matchedTransfer.amount, cleanHash]);
      }

      // 6. Credit user's FINVORA MAIN wallet balance with immutable ledger entry
      const creditResult = WalletService.credit({
        userId,
        walletType: 'MAIN',
        transactionType: 'DEPOSIT',
        amount: matchedTransfer.amount,
        referenceId: depCode,
        description: `Verified BEP-20 USDT deposit (Tx: ${cleanHash.slice(0, 10)}...${cleanHash.slice(-8)})`
      });

      // Audit log
      AuditService.log({
        actorId: userId,
        actorName: 'User',
        actorRole: 'USER',
        action: 'BLOCKCHAIN_DEPOSIT_CONFIRMED',
        targetType: 'DEPOSIT',
        targetId: depReq ? depReq.id : cleanHash,
        details: {
          txHash: cleanHash,
          amount: matchedTransfer.amount,
          from: matchedTransfer.from,
          to: matchedTransfer.to,
          blockNumber: onChainResult.blockNumber
        }
      });

      console.log(`[DepositMonitorService] Successfully credited user ${userId} with ${matchedTransfer.amount} USDT (Tx: ${cleanHash})`);

      return {
        success: true,
        status: 'CONFIRMED',
        amount: matchedTransfer.amount,
        txHash: cleanHash,
        blockNumber: onChainResult.blockNumber,
        confirmations: onChainResult.confirmations,
        depositCode: depCode,
        newBalance: creditResult.balanceAfter,
        message: `Successfully verified and credited ${matchedTransfer.amount} USDT to your FINVORA Main Wallet.`
      };
    });
  }

  /**
   * Get deposit request status by ID or code
   */
  static getDepositStatus(idOrCode) {
    let req = null;
    if (typeof idOrCode === 'number' || !isNaN(idOrCode)) {
      req = get("SELECT * FROM deposit_requests WHERE id = ?", [idOrCode]);
    } else {
      req = get("SELECT * FROM deposit_requests WHERE deposit_code = ?", [idOrCode]);
    }

    if (!req) return null;

    const bcDep = get("SELECT * FROM blockchain_deposits WHERE deposit_request_id = ? OR tx_hash = ?", [req.id, req.tx_hash]);
    return {
      ...req,
      blockchainDeposit: bcDep || null
    };
  }

  /**
   * Get all verified and unmatched blockchain deposits for Admin
   */
  static getAdminBlockchainDeposits({ status = null, limit = 50, offset = 0 } = {}) {
    let sql = `
      SELECT bd.*, u.username, u.email, u.user_code, dr.deposit_code
      FROM blockchain_deposits bd
      LEFT JOIN users u ON u.id = bd.user_id
      LEFT JOIN deposit_requests dr ON dr.id = bd.deposit_request_id
    `;
    const params = [];

    if (status) {
      sql += " WHERE bd.status = ?";
      params.push(status);
    }

    sql += " ORDER BY bd.id DESC LIMIT ? OFFSET ?";
    params.push(limit, offset);

    return query(sql, params);
  }

  /**
   * Get unmatched deposits specifically
   */
  static getUnmatchedDeposits() {
    return query(`
      SELECT bd.*, u.username, u.email
      FROM blockchain_deposits bd
      LEFT JOIN users u ON u.id = bd.user_id
      WHERE bd.status = 'UNMATCHED'
      ORDER BY bd.id DESC
    `);
  }

  /**
   * Get blockchain checkpoint: last processed block
   */
  static getLastProcessedBlock() {
    const row = get("SELECT last_processed_block FROM blockchain_blocks WHERE chain_id = ?", [BLOCKCHAIN_CONFIG.CHAIN_ID]);
    return row ? row.last_processed_block : 0;
  }

  /**
   * Update checkpoint block
   */
  static updateLastProcessedBlock(blockNumber) {
    run(`
      INSERT INTO blockchain_blocks (chain_id, last_processed_block, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(chain_id) DO UPDATE SET
        last_processed_block = excluded.last_processed_block,
        updated_at = CURRENT_TIMESTAMP
    `, [BLOCKCHAIN_CONFIG.CHAIN_ID, blockNumber]);
  }
}

module.exports = DepositMonitorService;
