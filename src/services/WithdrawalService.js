/**
 * FINVORA — Withdrawal Service
 * 
 * Manages the non-custodial, server-approved USDT (BEP-20) withdrawal lifecycle on BNB Smart Chain.
 * Enforces:
 * - Read-only destination strictly locked to user's verified active EVM wallet
 * - Server-side 10% fee calculation
 * - Profit-only withdrawal rule (Deposit capital cannot be withdrawn)
 * - Atomic balance reservation (PENDING_ADMIN_APPROVAL)
 * - Mandatory admin authorization before broadcast
 * - Server-side signing via BlockchainSignerService sending exact net amount
 * - Automatic REVIEW_REQUIRED safeguard if wallet was modified
 */

const { db, query, get, run, transaction } = require('../database/db');
const BLOCKCHAIN_CONFIG = require('../config/blockchain');
const BlockchainService = require('./BlockchainService');
const BlockchainSignerService = require('./BlockchainSignerService');
const AdminWalletService = require('./AdminWalletService');
const UserWalletService = require('./UserWalletService');
const WalletService = require('./WalletService');
const AuditService = require('./AuditService');
const crypto = require('crypto');

class WithdrawalService {
  /**
   * User requests a withdrawal (USDT BEP-20 on BSC)
   * Destination is strictly locked to user's verified connected wallet.
   */
  static requestWithdrawal({ userId, amount, walletType = 'PROFIT' }) {
    if (!userId) throw new Error('User authentication required.');

    // 1. Verify user has an active verified EVM wallet
    const activeWallet = UserWalletService.getActiveWallet(userId);
    if (!activeWallet || !activeWallet.isVerified) {
      throw new Error('Please connect and verify your BNB Smart Chain wallet first before requesting a withdrawal.');
    }

    const destinationAddress = activeWallet.walletAddress;

    // Verify destination is not FINVORA's own active admin wallet
    if (AdminWalletService.isDepositWallet(destinationAddress)) {
      throw new Error('Withdrawal destination cannot be the FINVORA treasury address.');
    }

    if (!amount || amount <= 0) {
      throw new Error('Withdrawal amount must be greater than zero.');
    }

    // 2. Fetch min/max limits from settings
    const settings = query("SELECT key, value FROM mlm_settings WHERE key IN ('min_withdrawal', 'max_withdrawal')");
    let minWithdrawal = 10.0;
    let maxWithdrawal = 50000.0;

    for (const s of settings) {
      if (s.key === 'min_withdrawal') minWithdrawal = parseFloat(s.value) || 10.0;
      if (s.key === 'max_withdrawal') maxWithdrawal = parseFloat(s.value) || 50000.0;
    }

    const requestedAmount = Number(parseFloat(amount).toFixed(4));
    if (requestedAmount < minWithdrawal) {
      throw new Error(`Minimum withdrawal amount is $${minWithdrawal.toFixed(2)} USDT.`);
    }
    if (requestedAmount > maxWithdrawal) {
      throw new Error(`Maximum withdrawal amount is $${maxWithdrawal.toFixed(2)} USDT.`);
    }

    const requestedType = (walletType || 'PROFIT').toUpperCase();

    // 3. Strict rejection of Deposit capital (Main Wallet)
    if (requestedType === 'MAIN') {
      throw new Error('Deposit capital cannot be withdrawn. Withdrawals are strictly restricted to earned profits (Package ROI, Referral commissions, Level income, Salary).');
    }

    // 4. Validate withdrawable profit balance
    const wallet = WalletService.getWallet(userId);
    const availableProfit = wallet.withdrawable_profit; // (roi + referral + level + salary)

    if (requestedAmount > availableProfit) {
      throw new Error(
        `Insufficient withdrawable profit. Requested: $${requestedAmount.toFixed(2)} USDT, Available Profit: $${availableProfit.toFixed(2)} USDT ` +
        `(ROI: $${wallet.roi_balance.toFixed(2)}, Referral: $${wallet.referral_balance.toFixed(2)}, Level: $${wallet.level_balance.toFixed(2)}, Salary: $${wallet.salary_balance.toFixed(2)}).`
      );
    }

    const validSubWallets = ['ROI', 'REFERRAL', 'LEVEL', 'SALARY'];
    if (validSubWallets.includes(requestedType)) {
      const col = requestedType.toLowerCase() + '_balance';
      const subBal = Number(wallet[col] || 0);
      if (requestedAmount > subBal) {
        throw new Error(`Insufficient balance in ${requestedType} profit wallet. Available: $${subBal.toFixed(2)} USDT, Requested: $${requestedAmount.toFixed(2)} USDT.`);
      }
    }

    // 5. Server-side 10% Fee Calculation
    const feePct = BLOCKCHAIN_CONFIG.WITHDRAWAL_FEE_PERCENT; // 10%
    const feeAmount = Number(((requestedAmount * feePct) / 100).toFixed(4));
    const netAmount = Number((requestedAmount - feeAmount).toFixed(4));
    const withdrawalCode = WalletService.generateTxCode('WD');
    const idempotencyKey = crypto.randomUUID();

    // 6. Atomic Balance Reservation
    return transaction(() => {
      const debitBreakdown = [];

      if (validSubWallets.includes(requestedType)) {
        WalletService.debit({
          userId,
          walletType: requestedType,
          transactionType: 'WITHDRAWAL',
          amount: requestedAmount,
          referenceId: withdrawalCode,
          description: `Withdrawal request #${withdrawalCode} from ${requestedType} profit wallet (Gross: $${requestedAmount.toFixed(2)} USDT, Fee: $${feeAmount.toFixed(2)} USDT, Net: $${netAmount.toFixed(2)} USDT)`
        });
        debitBreakdown.push({ source: requestedType, amount: requestedAmount });
      } else {
        // Combined profit withdrawal: progressively deduct across profit streams (ROI -> REFERRAL -> LEVEL -> SALARY)
        let remaining = requestedAmount;
        for (const stream of validSubWallets) {
          if (remaining <= 0) break;
          const col = stream.toLowerCase() + '_balance';
          const currentBal = Number(get(`SELECT ${col} FROM wallets WHERE user_id = ?`, [userId])?.[col] || 0);
          if (currentBal > 0) {
            const slice = Math.min(currentBal, remaining);
            WalletService.debit({
              userId,
              walletType: stream,
              transactionType: 'WITHDRAWAL',
              amount: slice,
              referenceId: withdrawalCode,
              description: `Withdrawal request #${withdrawalCode} portion from ${stream} profit wallet ($${slice.toFixed(2)} USDT)`
            });
            debitBreakdown.push({ source: stream, amount: slice });
            remaining = Number((remaining - slice).toFixed(4));
          }
        }
      }

      // Record in withdrawals table with status PENDING_ADMIN_APPROVAL
      const res = run(`
        INSERT INTO withdrawals (
          withdrawal_code, user_id, requested_amount, fee_pct, fee_amount,
          net_amount, wallet_type, payout_method, account_details, status, idempotency_key, admin_note
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'USDT_BEP20', ?, 'PENDING_ADMIN_APPROVAL', ?, ?)
      `, [
        withdrawalCode,
        userId,
        requestedAmount,
        feePct,
        feeAmount,
        netAmount,
        requestedType,
        destinationAddress,
        idempotencyKey,
        `Profit Withdrawal Breakdown: ${JSON.stringify(debitBreakdown)}`
      ]);

      console.log(`[WithdrawalService] User #${userId} requested withdrawal #${withdrawalCode} ($${requestedAmount} -> Net $${netAmount} to ${destinationAddress})`);

      // Asynchronously sync to MongoDB Atlas
      try {
        const { syncToMongo } = require('../database/mongo_sync');
        syncToMongo('withdrawals', 'update', { withdrawal_code: withdrawalCode }, {
          sqlite_id: res.lastInsertRowid,
          withdrawal_code: withdrawalCode,
          user_id: userId,
          requested_amount: requestedAmount,
          fee_pct: feePct,
          fee_amount: feeAmount,
          net_amount: netAmount,
          wallet_type: requestedType,
          account_details: destinationAddress,
          status: 'PENDING_ADMIN_APPROVAL',
          created_at: new Date()
        });
      } catch (_) {}

      return {
        withdrawalId: res.lastInsertRowid,
        withdrawalCode,
        requestedAmount,
        feePct,
        feeAmount,
        netAmount,
        walletType: requestedType,
        destinationAddress,
        status: 'PENDING_ADMIN_APPROVAL',
        idempotencyKey
      };
    });
  }

  /**
   * Acquire a processing lock to prevent double approval
   */
  static acquireLock(withdrawalId, adminName = 'Admin') {
    const lockKey = `wd_lock_${withdrawalId}`;
    try {
      run(`
        INSERT INTO transaction_processing_locks (lock_key, locked_by)
        VALUES (?, ?)
      `, [lockKey, adminName]);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Release processing lock
   */
  static releaseLock(withdrawalId) {
    const lockKey = `wd_lock_${withdrawalId}`;
    try {
      run("DELETE FROM transaction_processing_locks WHERE lock_key = ?", [lockKey]);
    } catch {}
  }

  /**
   * Mandatory Admin Approval & Server-Signed Payout
   * Broadcasts exact net USDT amount to user's verified wallet
   */
  static async approveAndSendWithdrawal({ withdrawalId, adminId = null, adminName = 'Admin', ipAddress = null }) {
    const wd = get('SELECT * FROM withdrawals WHERE id = ?', [withdrawalId]);
    if (!wd) throw new Error('Withdrawal request not found.');

    const allowedStatuses = ['PENDING', 'PENDING_ADMIN_APPROVAL', 'REVIEW_REQUIRED'];
    if (!allowedStatuses.includes(wd.status)) {
      throw new Error(`Withdrawal is already in '${wd.status}' status and cannot be approved.`);
    }

    // Acquire lock against double-click / concurrent execution
    const locked = this.acquireLock(withdrawalId, adminName);
    if (!locked) {
      throw new Error('WITHDRAWAL_ALREADY_PROCESSING: This withdrawal is currently being processed by another session.');
    }

    try {
      const destination = BLOCKCHAIN_CONFIG.normalizeAddress(wd.account_details);
      if (!destination) {
        throw new Error(`Invalid destination address: ${wd.account_details}`);
      }

      // Check that user's active wallet still matches destination
      const activeWallet = UserWalletService.getActiveWallet(wd.user_id);
      if (!activeWallet || activeWallet.walletAddress.toLowerCase() !== destination.toLowerCase()) {
        // Destination does not match user's current verified wallet
        if (wd.status !== 'REVIEW_REQUIRED') {
          run("UPDATE withdrawals SET status = 'REVIEW_REQUIRED', admin_note = 'Warning: User current wallet does not match withdrawal destination' WHERE id = ?", [withdrawalId]);
        }
        throw new Error(
          `WALLET_MISMATCH: User's currently connected wallet (${activeWallet?.walletAddress || 'None'}) does not match requested destination (${destination}). Review is required.`
        );
      }

      const netAmount = Number(parseFloat(wd.net_amount).toFixed(4));
      if (netAmount <= 0) {
        throw new Error('Net withdrawal amount must be greater than zero.');
      }

      // Update status to PROCESSING
      run(`
        UPDATE withdrawals 
        SET status = 'PROCESSING', admin_note = ?, processed_at = CURRENT_TIMESTAMP 
        WHERE id = ?
      `, [`Approved by ${adminName}, broadcasting to BSC...`, withdrawalId]);

      // Broadcast transaction via BlockchainSignerService
      console.log(`[WithdrawalService] Broadcasting payout for WD #${wd.withdrawal_code} (${netAmount} USDT to ${destination})...`);

      let txResult;
      try {
        txResult = await BlockchainSignerService.signAndSendUsdtTransfer({
          toAddress: destination,
          amountUsdt: netAmount
        });
      } catch (broadcastErr) {
        console.error('[WithdrawalService] Payout broadcast failed:', broadcastErr.message);
        // Rollback status to PENDING_ADMIN_APPROVAL so admin can retry after funding gas/USDT
        run("UPDATE withdrawals SET status = 'PENDING_ADMIN_APPROVAL', admin_note = ? WHERE id = ?", [
          `Broadcast failed: ${broadcastErr.message}`,
          withdrawalId
        ]);
        throw new Error(`Blockchain payout failed: ${broadcastErr.message}`);
      }

      const txHash = txResult.txHash;

      // Update status to BROADCASTED
      run(`
        UPDATE withdrawals
        SET status = 'BROADCASTED',
            tx_hash = ?,
            admin_note = ?,
            processed_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [txHash, `Disbursed on BSC: ${txHash}`, withdrawalId]);

      // Record in blockchain_withdrawals
      run(`
        INSERT INTO blockchain_withdrawals (
          withdrawal_id, tx_hash, from_address, to_address, token_contract,
          gross_amount, fee_amount, net_amount, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'BROADCASTED')
      `, [
        withdrawalId,
        txHash,
        txResult.fromAddress,
        destination,
        BLOCKCHAIN_CONFIG.CONTRACT_ADDRESS,
        wd.requested_amount,
        wd.fee_amount,
        netAmount
      ]);

      AuditService.log({
        actorId: adminId,
        actorName: adminName,
        actorRole: 'ADMIN',
        action: 'WITHDRAWAL_BROADCASTED',
        targetType: 'WITHDRAWAL',
        targetId: withdrawalId,
        details: {
          txHash,
          amount: netAmount,
          destination,
          withdrawalCode: wd.withdrawal_code
        },
        ipAddress
      });

      // Monitor confirmation asynchronously
      this._monitorWithdrawalConfirmation(withdrawalId, txHash, wd.user_id, netAmount).catch(err => {
        console.error(`[WithdrawalService] Confirmation watcher error for ${txHash}:`, err.message);
      });

      return {
        success: true,
        status: 'BROADCASTED',
        txHash,
        explorerUrl: BLOCKCHAIN_CONFIG.getTxExplorerUrl(txHash),
        message: `Withdrawal #${wd.withdrawal_code} (${netAmount} USDT) broadcasted to BNB Smart Chain!`
      };
    } finally {
      this.releaseLock(withdrawalId);
    }
  }

  /**
   * Monitor on-chain confirmation for a broadcasted withdrawal
   */
  static async _monitorWithdrawalConfirmation(withdrawalId, txHash, userId, netAmount) {
    try {
      const result = await BlockchainService.waitForConfirmation(txHash, BLOCKCHAIN_CONFIG.MIN_CONFIRMATIONS, 90000);
      if (result.confirmed) {
        transaction(() => {
          run(`
            UPDATE withdrawals
            SET status = 'COMPLETED',
                admin_note = 'Confirmed on BSC Mainnet',
                processed_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `, [withdrawalId]);

          run(`
            UPDATE blockchain_withdrawals
            SET status = 'COMPLETED',
                block_number = ?,
                completed_at = CURRENT_TIMESTAMP
            WHERE tx_hash = ?
          `, [result.blockNumber, txHash]);

          // Update user wallet total_withdrawn metric
          run(`
            UPDATE wallets
            SET total_withdrawn = total_withdrawn + ?
            WHERE user_id = ?
          `, [netAmount, userId]);
        });

        console.log(`[WithdrawalService] Withdrawal #${withdrawalId} confirmed on BSC (Block #${result.blockNumber})`);
      } else {
        console.warn(`[WithdrawalService] Withdrawal #${withdrawalId} confirmation delayed/failed: ${result.error}`);
      }
    } catch (err) {
      console.error(`[WithdrawalService] Error in confirmation watcher:`, err.message);
    }
  }

  /**
   * Admin rejects withdrawal: releases reserved funds back to user's profit balance
   */
  static rejectWithdrawal(withdrawalId, adminNote = 'Rejected by administrator', adminId = null, adminName = 'Admin') {
    const wd = get('SELECT * FROM withdrawals WHERE id = ?', [withdrawalId]);
    if (!wd) throw new Error('Withdrawal request not found.');

    const rejectableStatuses = ['PENDING', 'PENDING_ADMIN_APPROVAL', 'REVIEW_REQUIRED'];
    if (!rejectableStatuses.includes(wd.status)) {
      throw new Error(`Withdrawal is in '${wd.status}' status and cannot be rejected.`);
    }

    return transaction(() => {
      run(`
        UPDATE withdrawals
        SET status = 'REJECTED',
            admin_note = ?,
            processed_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [adminNote, withdrawalId]);

      // Refund the reserved requested amount back to user's profit balance (never to main capital)
      const refundWallet = ['ROI', 'REFERRAL', 'LEVEL', 'SALARY'].includes((wd.wallet_type || '').toUpperCase())
        ? wd.wallet_type.toUpperCase()
        : 'ROI';

      WalletService.credit({
        userId: wd.user_id,
        walletType: refundWallet,
        transactionType: 'REFUND',
        amount: wd.requested_amount,
        referenceId: wd.withdrawal_code,
        description: `Refund for rejected withdrawal #${wd.withdrawal_code} to ${refundWallet} profit wallet: ${adminNote}`
      });

      AuditService.log({
        actorId: adminId,
        actorName: adminName,
        actorRole: 'ADMIN',
        action: 'WITHDRAWAL_REJECTED',
        targetType: 'WITHDRAWAL',
        targetId: withdrawalId,
        details: {
          withdrawalCode: wd.withdrawal_code,
          refundedAmount: wd.requested_amount,
          reason: adminNote
        }
      });

      this.releaseLock(withdrawalId);

      return {
        success: true,
        status: 'REJECTED',
        message: `Withdrawal #${wd.withdrawal_code} has been rejected and $${wd.requested_amount.toFixed(2)} USDT refunded to user.`
      };
    });
  }

  /**
   * Alias for backward compatibility
   */
  static approveAndSendOnChain(params) {
    return this.approveAndSendWithdrawal(params);
  }

  /**
   * Get user's withdrawal history
   */
  static getUserWithdrawals(userId) {
    return query('SELECT * FROM withdrawals WHERE user_id = ? ORDER BY id DESC', [userId]);
  }

  /**
   * Get all withdrawals (admin)
   */
  static getAllWithdrawals({ status = null, limit = 50, offset = 0 } = {}) {
    let sql = `
      SELECT w.*, u.username, u.email, u.user_code, bw.status as blockchain_status, bw.block_number
      FROM withdrawals w
      JOIN users u ON u.id = w.user_id
      LEFT JOIN blockchain_withdrawals bw ON bw.withdrawal_id = w.id
    `;
    const params = [];

    if (status) {
      sql += ' WHERE w.status = ?';
      params.push(status);
    }

    sql += ' ORDER BY w.id DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    return query(sql, params);
  }

  /**
   * Get blockchain withdrawals for monitor
   */
  static getAdminBlockchainWithdrawals({ limit = 50, offset = 0 } = {}) {
    return query(`
      SELECT bw.*, w.withdrawal_code, u.username, u.user_code
      FROM blockchain_withdrawals bw
      JOIN withdrawals w ON w.id = bw.withdrawal_id
      JOIN users u ON u.id = w.user_id
      ORDER BY bw.id DESC
      LIMIT ? OFFSET ?
    `, [limit, offset]);
  }
}

module.exports = WithdrawalService;
