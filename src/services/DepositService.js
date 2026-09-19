/**
 * FINVORA — Deposit Service
 * 
 * Handles incoming USDT (BEP-20) deposits on BNB Smart Chain.
 * Enforces strict blockchain verification:
 * - Receipt status = 1 (success)
 * - Official BSC USDT contract match
 * - Sender match with user's verified active wallet
 * - Recipient match with FINVORA's single active admin wallet
 * - Multi-level idempotency to prevent duplicate credits
 */

const { db, query, get, run, transaction } = require('../database/db');
const BLOCKCHAIN_CONFIG = require('../config/blockchain');
const BlockchainService = require('./BlockchainService');
const AdminWalletService = require('./AdminWalletService');
const UserWalletService = require('./UserWalletService');
const WalletService = require('./WalletService');
const AuditService = require('./AuditService');

class DepositService {
  /**
   * Submit a direct blockchain deposit transaction hash
   */
  static submitDeposit({ userId, txHash, amount = 0 }) {
    if (!userId) throw new Error('User authentication required.');

    const cleanHash = (txHash || '').trim();
    if (!/^0x[a-fA-F0-9]{64}$/.test(cleanHash)) {
      throw new Error('Invalid BSC transaction hash. Must be a 66-character hexadecimal string starting with 0x.');
    }

    // 1. Verify user has a connected verified wallet
    const activeWallet = UserWalletService.getActiveWallet(userId);
    if (!activeWallet || !activeWallet.isVerified) {
      throw new Error('You must connect and verify your Web3 wallet before submitting a deposit.');
    }

    // 2. Check active admin wallet exists
    const activeAdminWallet = AdminWalletService.getActiveAdminWallet();
    if (!activeAdminWallet) {
      throw new Error('FINVORA deposit receiving wallet is temporarily unavailable. Please try again shortly.');
    }

    // 3. Idempotency check: Ensure transaction hash has not already been processed or credited
    const existingCredited = get(`
      SELECT id, status, amount FROM deposits 
      WHERE transaction_reference = ? AND status = 'APPROVED'
    `, [cleanHash]);

    if (existingCredited) {
      return {
        alreadyCredited: true,
        depositId: existingCredited.id,
        status: 'APPROVED',
        amount: existingCredited.amount,
        message: 'This blockchain deposit has already been verified and credited to your account.'
      };
    }

    // Check if pending record already exists
    const existingPending = get(`
      SELECT id, status, amount, deposit_code FROM deposits 
      WHERE transaction_reference = ? AND user_id = ?
    `, [cleanHash, userId]);

    if (existingPending) {
      return {
        depositId: existingPending.id,
        depositCode: existingPending.deposit_code,
        status: existingPending.status,
        amount: existingPending.amount,
        txHash: cleanHash
      };
    }

    // 4. Create new pending deposit record
    const depositCode = WalletService.generateTxCode('DEP');
    const res = run(`
      INSERT INTO deposits (
        deposit_code, user_id, amount, payment_method,
        transaction_reference, status, created_at
      ) VALUES (?, ?, ?, 'USDT_BEP20', ?, 'PENDING', CURRENT_TIMESTAMP)
    `, [depositCode, userId, Number(amount) || 0, cleanHash]);

    // Asynchronously sync to MongoDB Atlas
    try {
      const { syncToMongo } = require('../database/mongo_sync');
      syncToMongo('deposits', 'update', { deposit_code: depositCode }, {
        sqlite_id: res.lastInsertRowid,
        deposit_code: depositCode,
        user_id: userId,
        amount: Number(amount) || 0,
        payment_method: 'USDT_BEP20',
        transaction_reference: cleanHash,
        status: 'PENDING',
        created_at: new Date()
      });
    } catch (_) {}

    return {
      depositId: res.lastInsertRowid,
      depositCode,
      txHash: cleanHash,
      status: 'PENDING',
      amount: Number(amount) || 0
    };
  }

  /**
   * Verify an on-chain transaction hash and credit user's internal FINVORA balance atomically
   */
  static async verifyAndCreditDeposit({ depositId = null, txHash, userId = null }) {
    const cleanHash = (txHash || '').trim();
    if (!/^0x[a-fA-F0-9]{64}$/.test(cleanHash)) {
      throw new Error('Invalid transaction hash format.');
    }

    // 1. Resolve deposit record
    let dep = depositId ? get('SELECT * FROM deposits WHERE id = ?', [depositId]) : null;
    if (!dep) {
      dep = get('SELECT * FROM deposits WHERE transaction_reference = ? ORDER BY id DESC LIMIT 1', [cleanHash]);
    }

    if (dep && dep.status === 'APPROVED') {
      return {
        success: true,
        alreadyProcessed: true,
        depositId: dep.id,
        amount: dep.amount,
        txHash: cleanHash,
        status: 'APPROVED',
        message: 'Deposit already verified and credited.'
      };
    }

    const effectiveUserId = userId || (dep ? dep.user_id : null);
    if (!effectiveUserId) {
      throw new Error('Deposit cannot be verified without an associated user account.');
    }

    // 2. Fetch user's active verified wallet
    const activeWallet = UserWalletService.getActiveWallet(effectiveUserId);
    if (!activeWallet) {
      throw new Error('User does not have an active verified Web3 wallet.');
    }

    // 3. Fetch FINVORA active admin wallet
    const activeAdminWallet = AdminWalletService.getActiveAdminWallet();

    // 4. Perform live BSC transaction verification via BlockchainService
    const verification = await BlockchainService.verifyTransaction(cleanHash);
    if (!verification.success) {
      throw new Error(verification.error || 'Transaction verification on BNB Smart Chain failed.');
    }

    // 5. Inspect decoded BEP-20 USDT transfer events
    // Find matching transfer from user's verified wallet to the admin wallet
    const matchingTransfer = verification.transfers.find(t => {
      const fromMatch = t.from.toLowerCase() === activeWallet.walletAddress.toLowerCase();
      const toMatch = t.to.toLowerCase() === activeAdminWallet.toLowerCase();
      return fromMatch && toMatch;
    });

    if (!matchingTransfer) {
      // Provide actionable diagnostics
      const transfersDesc = verification.transfers.map(t => `From: ${t.from} -> To: ${t.to} (${t.amount} USDT)`).join('; ');
      throw new Error(
        `TRANSFER_MISMATCH: No matching USDT transfer was found. ` +
        `Expected sender: ${activeWallet.walletAddress}, Expected recipient: ${activeAdminWallet}. ` +
        `Detected transfers in tx: [${transfersDesc || 'None'}]`
      );
    }

    const creditedAmount = Number(matchingTransfer.amount);
    if (creditedAmount <= 0) {
      throw new Error('Transferred USDT amount must be greater than zero.');
    }

    // 6. Check logIndex level idempotency in blockchain_deposit_transfers
    const duplicateTransfer = get(`
      SELECT id FROM blockchain_deposit_transfers 
      WHERE tx_hash = ? AND log_index = ?
    `, [cleanHash, matchingTransfer.logIndex]);

    if (duplicateTransfer) {
      throw new Error('IDEMPOTENCY_VIOLATION: This blockchain transfer log has already been credited to a FINVORA account.');
    }

    // 7. Atomic Credit Execution
    return transaction(() => {
      let finalDepositId = dep ? dep.id : null;
      let depositCode = dep ? dep.deposit_code : WalletService.generateTxCode('DEP');

      if (dep) {
        run(`
          UPDATE deposits 
          SET amount = ?,
              status = 'APPROVED',
              admin_note = 'Verified on BSC via Web3 direct transfer',
              processed_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `, [creditedAmount, dep.id]);
      } else {
        const ins = run(`
          INSERT INTO deposits (
            deposit_code, user_id, amount, payment_method,
            transaction_reference, status, admin_note, processed_at
          ) VALUES (?, ?, ?, 'USDT_BEP20', ?, 'APPROVED', 'Verified on BSC via Web3 direct transfer', CURRENT_TIMESTAMP)
        `, [depositCode, effectiveUserId, creditedAmount, cleanHash]);
        finalDepositId = ins.lastInsertRowid;
      }

      // Record in blockchain_deposits
      run(`
        INSERT OR REPLACE INTO blockchain_deposits (
          user_id, deposit_id, tx_hash, block_number, from_address, to_address,
          token_contract, amount, confirmations, status, verified_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'CONFIRMED', CURRENT_TIMESTAMP)
      `, [
        effectiveUserId,
        finalDepositId,
        cleanHash,
        verification.blockNumber,
        matchingTransfer.from,
        matchingTransfer.to,
        BLOCKCHAIN_CONFIG.CONTRACT_ADDRESS,
        creditedAmount,
        verification.confirmations
      ]);

      // Record in blockchain_deposit_transfers for strict idempotency
      run(`
        INSERT OR IGNORE INTO blockchain_deposit_transfers (
          tx_hash, log_index, from_address, to_address, amount, status
        ) VALUES (?, ?, ?, ?, ?, 'CREDITED')
      `, [
        cleanHash,
        matchingTransfer.logIndex,
        matchingTransfer.from,
        matchingTransfer.to,
        creditedAmount
      ]);

      // Credit user's internal FINVORA Main Wallet
      WalletService.credit({
        userId: effectiveUserId,
        walletType: 'MAIN',
        transactionType: 'DEPOSIT',
        amount: creditedAmount,
        referenceId: depositCode,
        description: `USDT (BEP-20) blockchain deposit #${depositCode} credited (${creditedAmount} USDT, TxID: ${cleanHash.slice(0, 10)}...${cleanHash.slice(-8)})`
      });

      AuditService.log({
        actorId: effectiveUserId,
        actorName: `User #${effectiveUserId}`,
        actorRole: 'USER',
        action: 'BLOCKCHAIN_DEPOSIT_CREDITED',
        targetType: 'DEPOSIT',
        targetId: finalDepositId,
        details: {
          txHash: cleanHash,
          blockNumber: verification.blockNumber,
          amount: creditedAmount,
          sender: matchingTransfer.from,
          recipient: matchingTransfer.to
        }
      });

      console.log(`[DepositService] Successfully credited ${creditedAmount} USDT to User #${effectiveUserId} for Tx ${cleanHash}`);

      return {
        success: true,
        creditedAmount,
        depositId: finalDepositId,
        depositCode,
        txHash: cleanHash,
        status: 'APPROVED',
        message: `Successfully verified and credited $${creditedAmount.toFixed(2)} USDT to your FINVORA balance!`
      };
    });
  }

  /**
   * Submit manual / offline deposit request (backward compatibility)
   */
  static requestDeposit({ userId, amount, paymentMethod = 'USDT_BEP20', transactionReference = null, proofImage = null }) {
    if (amount <= 0) throw new Error('Deposit amount must be greater than zero');
    if (!transactionReference || !transactionReference.trim()) {
      throw new Error('Please provide the BSC blockchain transaction hash (TxID).');
    }

    const depositCode = WalletService.generateTxCode('DEP');
    const res = run(`
      INSERT INTO deposits (
        deposit_code, user_id, amount, payment_method,
        transaction_reference, proof_image, status
      ) VALUES (?, ?, ?, 'USDT_BEP20', ?, ?, 'PENDING')
    `, [
      depositCode,
      userId,
      amount,
      transactionReference.trim(),
      proofImage
    ]);

    return {
      depositId: res.lastInsertRowid,
      depositCode,
      amount,
      paymentMethod: 'USDT_BEP20',
      status: 'PENDING'
    };
  }

  /**
   * Admin manual approves deposit
   */
  static approveDeposit(depositId, adminNote = 'Approved by administrator') {
    const dep = get('SELECT * FROM deposits WHERE id = ?', [depositId]);
    if (!dep) throw new Error('Deposit not found');
    if (dep.status !== 'PENDING') throw new Error(`Deposit is already in '${dep.status}' status`);

    return transaction(() => {
      run(`
        UPDATE deposits
        SET status = 'APPROVED',
            admin_note = ?,
            processed_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [adminNote, depositId]);

      // Credit user MAIN wallet
      WalletService.credit({
        userId: dep.user_id,
        walletType: 'MAIN',
        transactionType: 'DEPOSIT',
        amount: dep.amount,
        referenceId: dep.deposit_code,
        description: `Deposit #${dep.deposit_code} approved via ${dep.payment_method}`
      });

      return { success: true, message: `Deposit of $${dep.amount.toFixed(2)} approved and credited` };
    });
  }

  /**
   * Admin rejects deposit
   */
  static rejectDeposit(depositId, adminNote = 'Deposit verification failed') {
    const dep = get('SELECT * FROM deposits WHERE id = ?', [depositId]);
    if (!dep) throw new Error('Deposit not found');
    if (dep.status !== 'PENDING') throw new Error(`Deposit is already in '${dep.status}' status`);

    run(`
      UPDATE deposits
      SET status = 'REJECTED',
          admin_note = ?,
          processed_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [adminNote, depositId]);

    return { success: true, message: 'Deposit rejected' };
  }

  /**
   * Get deposits for a user
   */
  static getUserDeposits(userId) {
    return query('SELECT * FROM deposits WHERE user_id = ? ORDER BY id DESC', [userId]);
  }

  /**
   * Get all deposits (admin)
   */
  static getAllDeposits({ status = null, limit = 50, offset = 0 } = {}) {
    let sql = `
      SELECT d.*, u.username, u.email, u.user_code
      FROM deposits d
      JOIN users u ON u.id = d.user_id
    `;
    const params = [];

    if (status) {
      sql += ' WHERE d.status = ?';
      params.push(status);
    }

    sql += ' ORDER BY d.id DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    return query(sql, params);
  }
}

module.exports = DepositService;
