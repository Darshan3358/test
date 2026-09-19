const { getDb, getNextSequence } = require('../database/mongo');
const crypto = require('crypto');

class WalletService {
  /**
   * Generate a unique transaction code
   */
  static generateTxCode(prefix = 'TXN') {
    const randomHex = crypto.randomBytes(4).toString('hex').toUpperCase();
    const timestamp = Date.now().toString().slice(-6);
    return `${prefix}-${timestamp}-${randomHex}`;
  }

  /**
   * Ensure user wallet exists
   */
  static async ensureWallet(userId) {
    const db = getDb();
    const uid = Number(userId);
    let wallet = await db.collection('wallets').findOne({ user_id: uid });
    if (!wallet) {
      await db.collection('wallets').insertOne({
        user_id: uid,
        main_balance: 0,
        roi_balance: 0,
        referral_balance: 0,
        level_balance: 0,
        salary_balance: 0,
        total_withdrawn: 0,
        created_at: new Date(),
        updated_at: new Date()
      });
      wallet = await db.collection('wallets').findOne({ user_id: uid });
    }
    return wallet;
  }

  /**
   * Get wallet balances for a user
   */
  static async getWallet(userId) {
    const wallet = await this.ensureWallet(userId);
    const roiBal = Number(wallet.roi_balance || 0);
    const refBal = Number(wallet.referral_balance || 0);
    const lvlBal = Number(wallet.level_balance || 0);
    const salBal = Number(wallet.salary_balance || 0);
    const mainBal = Number(wallet.main_balance || 0);

    const withdrawableProfit = Number((roiBal + refBal + lvlBal + salBal).toFixed(4));
    const depositCapital = Number(Math.max(0, mainBal - withdrawableProfit).toFixed(4));

    return {
      ...wallet,
      roi_balance: roiBal,
      referral_balance: refBal,
      level_balance: lvlBal,
      salary_balance: salBal,
      main_balance: mainBal,
      withdrawable_profit: withdrawableProfit,
      deposit_capital: depositCapital,
      profit_breakdown: {
        roi: Number(roiBal.toFixed(4)),
        referral: Number(refBal.toFixed(4)),
        level: Number(lvlBal.toFixed(4)),
        salary: Number(salBal.toFixed(4))
      },
      total_balance: Number(mainBal.toFixed(4))
    };
  }

  /**
   * Credit user wallet with an immutable ledger entry
   */
  static async credit({
    userId,
    walletType = 'MAIN',
    transactionType,
    amount,
    referenceId = null,
    description
  }) {
    if (amount <= 0) return null;
    const roundedAmount = Number(amount.toFixed(4));
    const db = getDb();
    const uid = Number(userId);

    const wallet = await this.ensureWallet(uid);
    const colMap = {
      'MAIN': 'main_balance',
      'ROI': 'roi_balance',
      'REFERRAL': 'referral_balance',
      'LEVEL': 'level_balance',
      'SALARY': 'salary_balance'
    };
    const col = colMap[walletType.toUpperCase()] || 'main_balance';
    const balanceBefore = Number(wallet[col] || 0);
    const balanceAfter = Number((balanceBefore + roundedAmount).toFixed(4));

    const updateDoc = {
      [col]: balanceAfter,
      updated_at: new Date()
    };

    if (walletType.toUpperCase() !== 'MAIN') {
      const curMain = Number(wallet.main_balance || 0);
      updateDoc.main_balance = Number((curMain + roundedAmount).toFixed(4));
    }

    await db.collection('wallets').updateOne({ user_id: uid }, { $set: updateDoc });

    const txCode = this.generateTxCode(transactionType.substring(0, 3));
    const txId = await getNextSequence('wallet_transactions');
    await db.collection('wallet_transactions').insertOne({
      id: txId,
      transaction_code: txCode,
      user_id: uid,
      wallet_type: walletType.toUpperCase(),
      transaction_type: transactionType,
      action: 'CREDIT',
      amount: roundedAmount,
      balance_before: balanceBefore,
      balance_after: balanceAfter,
      reference_id: referenceId,
      description,
      status: 'COMPLETED',
      created_at: new Date()
    });

    return {
      success: true,
      transactionCode: txCode,
      balanceBefore,
      balanceAfter,
      amount: roundedAmount
    };
  }

  /**
   * Debit user wallet with balance check and ledger entry
   */
  static async debit({
    userId,
    walletType = 'MAIN',
    transactionType,
    amount,
    referenceId = null,
    description
  }) {
    if (amount <= 0) throw new Error('Amount must be positive');
    const roundedAmount = Number(amount.toFixed(4));
    const db = getDb();
    const uid = Number(userId);

    const wallet = await this.ensureWallet(uid);
    const colMap = {
      'MAIN': 'main_balance',
      'ROI': 'roi_balance',
      'REFERRAL': 'referral_balance',
      'LEVEL': 'level_balance',
      'SALARY': 'salary_balance'
    };
    const col = colMap[walletType.toUpperCase()] || 'main_balance';
    const balanceBefore = Number(wallet[col] || 0);

    if (balanceBefore < roundedAmount) {
      throw new Error(`Insufficient funds in ${walletType} wallet. Available: $${balanceBefore.toFixed(2)}, Required: $${roundedAmount.toFixed(2)}`);
    }

    const balanceAfter = Number((balanceBefore - roundedAmount).toFixed(4));

    await db.collection('wallets').updateOne(
      { user_id: uid },
      { $set: { [col]: balanceAfter, updated_at: new Date() } }
    );

    const txCode = this.generateTxCode(transactionType.substring(0, 3));
    const txId = await getNextSequence('wallet_transactions');
    await db.collection('wallet_transactions').insertOne({
      id: txId,
      transaction_code: txCode,
      user_id: uid,
      wallet_type: walletType.toUpperCase(),
      transaction_type: transactionType,
      action: 'DEBIT',
      amount: roundedAmount,
      balance_before: balanceBefore,
      balance_after: balanceAfter,
      reference_id: referenceId,
      description,
      status: 'COMPLETED',
      created_at: new Date()
    });

    return {
      success: true,
      transactionCode: txCode,
      balanceBefore,
      balanceAfter,
      amount: roundedAmount
    };
  }

  /**
   * Transfer balance from an income wallet to Main Wallet
   */
  static async transferToMain(userId, fromWalletType, amount) {
    if (fromWalletType === 'MAIN') throw new Error('Source and destination cannot both be MAIN wallet');
    if (amount <= 0) throw new Error('Transfer amount must be positive');

    await this.debit({
      userId,
      walletType: fromWalletType,
      transactionType: 'TRANSFER',
      amount,
      description: `Internal transfer from ${fromWalletType} wallet to Main wallet`
    });

    await this.credit({
      userId,
      walletType: 'MAIN',
      transactionType: 'TRANSFER',
      amount,
      description: `Internal transfer received from ${fromWalletType} wallet`
    });

    return { success: true, message: `Successfully transferred $${amount.toFixed(2)} to Main wallet` };
  }

  /**
   * Get transaction history for a user
   */
  static async getTransactions(userId, { limit = 50, offset = 0, type = null } = {}) {
    const db = getDb();
    const filter = { user_id: Number(userId) };
    if (type) {
      filter.transaction_type = type;
    }
    return await db.collection('wallet_transactions')
      .find(filter)
      .sort({ id: -1, _id: -1 })
      .skip(offset)
      .limit(limit)
      .toArray();
  }
}

module.exports = WalletService;
