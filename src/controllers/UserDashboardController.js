const { query, get, run } = require('../database/db');
const WalletService = require('../services/WalletService');
const InvestmentService = require('../services/InvestmentService');
const GenealogyService = require('../services/GenealogyService');
const LevelUnlockService = require('../services/LevelUnlockService');
const SalaryService = require('../services/SalaryService');
const WithdrawalService = require('../services/WithdrawalService');
const DepositService = require('../services/DepositService');
const AdminWalletService = require('../services/AdminWalletService');
const UserWalletService = require('../services/UserWalletService');
const DepositMonitorService = require('../services/DepositMonitorService');
const BLOCKCHAIN_CONFIG = require('../config/blockchain');

class UserDashboardController {
  /**
   * Main User Dashboard Overview
   */
  static async showDashboard(req, res) {
    const userId = req.user.id;
    const wallet = WalletService.getWallet(userId);
    const invSummary = InvestmentService.getInvestmentSummary(userId);
    const genealogySummary = GenealogyService.getDownlineSummary(userId);
    const salarySummary = SalaryService.getDirectBusinessSummary(userId);
    const levelStatus = LevelUnlockService.getLevelStatus(userId);
    const recentTxns = WalletService.getTransactions(userId, { limit: 8 });

    // Calculate today's ROI earned
    const today = new Date().toISOString().slice(0, 10);
    const todayRoiRow = get(`
      SELECT COALESCE(SUM(net_amount), 0) as today_roi
      FROM daily_roi_ledger
      WHERE user_id = ? AND roi_date = ?
    `, [userId, today]);
    const todayRoi = todayRoiRow ? Number(todayRoiRow.today_roi) : 0;

    // Active investments
    const activeInvestments = query(`
      SELECT * FROM investments
      WHERE user_id = ? AND status = 'ACTIVE'
      ORDER BY id DESC
    `, [userId]);

    // Retrieve user wallet address if already connected/linked
    const userProfile = get('SELECT wallet_address FROM user_profiles WHERE user_id = ?', [userId]);
    const walletAddress = userProfile ? userProfile.wallet_address : null;

    res.render('dashboard/overview', {
      title: 'Dashboard — FINVORA',
      user: req.user,
      wallet,
      invSummary,
      genealogySummary,
      salarySummary,
      levelStatus,
      todayRoi,
      activeInvestments,
      recentTxns,
      walletAddress,
      query: req.query
    });
  }

  /**
   * Packages Store
   */
  static showPackages(req, res) {
    const userId = req.user.id;
    const wallet = WalletService.getWallet(userId);
    const packages = query("SELECT * FROM packages WHERE status = 'ACTIVE' ORDER BY price ASC");

    res.render('dashboard/packages', {
      title: 'Investment Packages — FINVORA',
      user: req.user,
      wallet,
      packages,
      error: req.query.error,
      success: req.query.success
    });
  }

  /**
   * Purchase Package Action
   */
  static async purchasePackage(req, res) {
    const userId = req.user.id;
    const { packageId } = req.body;

    try {
      const result = InvestmentService.purchasePackage({
        userId,
        packageId: parseInt(packageId, 10)
      });
      return res.redirect(`/my-investments?success=${encodeURIComponent(`Successfully activated ${result.packageName} package for $${result.amount.toFixed(2)}!`)}`);
    } catch (err) {
      return res.redirect(`/packages?error=${encodeURIComponent(err.message)}`);
    }
  }

  /**
   * My Investments
   */
  static showInvestments(req, res) {
    const userId = req.user.id;
    const investments = InvestmentService.getUserInvestments(userId);
    const invSummary = InvestmentService.getInvestmentSummary(userId);

    res.render('dashboard/investments', {
      title: 'My Investments — FINVORA',
      user: req.user,
      investments,
      invSummary,
      success: req.query.success
    });
  }

  /**
   * My Referrals & Affiliate Link (with Active/Inactive Status for all referred users)
   */
  static showReferrals(req, res) {
    const userId = req.user.id;
    const rawDirects = GenealogyService.getDirectReferrals(userId);
    const downlineSummary = GenealogyService.getDownlineSummary(userId);
    const appUrl = process.env.APP_URL || 'http://localhost:3000';

    const userProfile = get('SELECT wallet_address FROM user_profiles WHERE user_id = ?', [userId]);
    const walletAddress = userProfile ? userProfile.wallet_address : null;
    const referralLink = walletAddress ? `${appUrl}/register?ref=${walletAddress}` : '';

    // Status: Active (has invested capital & not suspended) vs Inactive (no investment or suspended)
    const allDirects = rawDirects.map(d => {
      const isActive = (d.status === 'ACTIVE' && Number(d.total_invested || 0) > 0);
      return {
        ...d,
        isActiveReferral: isActive,
        referralStatus: isActive ? 'Active' : 'Inactive'
      };
    });

    const activeCount = allDirects.filter(d => d.isActiveReferral).length;
    const inactiveCount = allDirects.length - activeCount;

    const filter = (req.query.status || 'ALL').toUpperCase();
    let filteredDirects = allDirects;
    if (filter === 'ACTIVE') {
      filteredDirects = allDirects.filter(d => d.isActiveReferral);
    } else if (filter === 'INACTIVE') {
      filteredDirects = allDirects.filter(d => !d.isActiveReferral);
    }

    res.render('dashboard/referrals', {
      title: 'Direct Referrals — FINVORA',
      user: req.user,
      directs: filteredDirects,
      allDirects,
      activeCount,
      inactiveCount,
      filter,
      downlineSummary,
      referralLink,
      walletAddress
    });
  }

  /**
   * Interactive Genealogy Tree & Level Breakdown
   */
  static showGenealogy(req, res) {
    const userId = req.user.id;
    const downlineSummary = GenealogyService.getDownlineSummary(userId);
    const levelStatus = LevelUnlockService.getLevelStatus(userId);

    res.render('dashboard/genealogy', {
      title: 'Genealogy Network — FINVORA',
      user: req.user,
      downlineSummary,
      levelStatus
    });
  }

  /**
   * 20-Level ROI-on-ROI Income Report
   */
  static showLevelIncome(req, res) {
    const userId = req.user.id;
    const commissions = query(`
      SELECT lc.*, u.username as downline_username, u.user_code as downline_code
      FROM level_commissions lc
      JOIN users u ON u.id = lc.downline_user_id
      WHERE lc.upline_user_id = ?
      ORDER BY lc.id DESC
      LIMIT 100
    `, [userId]);

    const levelSummary = query(`
      SELECT level, COUNT(*) as count, COALESCE(SUM(net_amount), 0) as total_earned
      FROM level_commissions
      WHERE upline_user_id = ?
      GROUP BY level
      ORDER BY level ASC
    `, [userId]);

    res.render('dashboard/level-income', {
      title: 'Level Income (ROI-on-ROI) — FINVORA',
      user: req.user,
      commissions,
      levelSummary
    });
  }

  /**
   * One-Time Direct Referral Income Ledger
   */
  static showReferralIncome(req, res) {
    const userId = req.user.id;
    const commissions = query(`
      SELECT rc.*, u.username as buyer_username, u.user_code as buyer_code
      FROM referral_commissions rc
      JOIN users u ON u.id = rc.buyer_user_id
      WHERE rc.upline_user_id = ?
      ORDER BY rc.id DESC
    `, [userId]);

    const totalRow = get(`
      SELECT COALESCE(SUM(net_amount), 0) as total_referral
      FROM referral_commissions
      WHERE upline_user_id = ?
    `, [userId]);

    res.render('dashboard/referral-income', {
      title: 'Referral Income — FINVORA',
      user: req.user,
      commissions,
      totalEarned: Number(totalRow ? totalRow.total_referral : 0)
    });
  }

  /**
   * Salary Target Plan Dashboard
   */
  static showSalary(req, res) {
    const userId = req.user.id;
    const salarySummary = SalaryService.getDirectBusinessSummary(userId);
    const salaryTargets = query("SELECT * FROM salary_targets WHERE status = 'ACTIVE' ORDER BY required_direct_business ASC");
    const userSalaryLevels = query(`
      SELECT * FROM user_salary_levels
      WHERE user_id = ?
      ORDER BY id DESC
    `, [userId]);
    const payouts = query(`
      SELECT * FROM salary_payouts
      WHERE user_id = ?
      ORDER BY id DESC
    `, [userId]);

    res.render('dashboard/salary', {
      title: 'Salary Target Plan — FINVORA',
      user: req.user,
      salarySummary,
      salaryTargets,
      userSalaryLevels,
      payouts
    });
  }

  /**
   * Multi-Wallet Overview & Transfer
   */
  static showWallet(req, res) {
    const userId = req.user.id;
    const wallet = WalletService.getWallet(userId);
    const recentTxns = WalletService.getTransactions(userId, { limit: 20 });

    res.render('dashboard/wallet', {
      title: 'Wallets & Assets — FINVORA',
      user: req.user,
      wallet,
      recentTxns,
      error: req.query.error,
      success: req.query.success
    });
  }

  /**
   * Transfer funds from sub-wallets to Main wallet
   */
  static transferToMain(req, res) {
    const userId = req.user.id;
    const { fromWallet, amount } = req.body;

    try {
      const parsedAmount = parseFloat(amount);
      WalletService.transferToMain(userId, fromWallet, parsedAmount);
      return res.redirect(`/wallet?success=${encodeURIComponent(`Transferred $${parsedAmount.toFixed(2)} from ${fromWallet} wallet to Main wallet`)}`);
    } catch (err) {
      return res.redirect(`/wallet?error=${encodeURIComponent(err.message)}`);
    }
  }

  /**
   * Deposit View (Strictly USDT BEP-20 on BNB Smart Chain)
   */
  static showDeposit(req, res) {
    const userId = req.user.id;
    const deposits = DepositService.getUserDeposits(userId);
    const userVerifiedWallet = UserWalletService.getActiveWallet(userId);
    const activeAdminWallet = AdminWalletService.getActiveAdminWallet();
    const wallet = WalletService.getWallet(userId);

    res.render('dashboard/deposit', {
      title: 'Deposit USDT (BEP-20) — FINVORA',
      user: req.user,
      deposits,
      userVerifiedWallet,
      treasuryAddress: activeAdminWallet,
      activeDepositWallet: activeAdminWallet,
      activeAdminWallet,
      wallet,
      config: BLOCKCHAIN_CONFIG,
      error: req.query.error,
      success: req.query.success
    });
  }

  /**
   * Submit Deposit Tx Hash or Verify
   */
  static async submitDeposit(req, res) {
    const userId = req.user.id;
    const { txHash, transactionReference, amount } = req.body;
    const effectiveHash = (txHash || transactionReference || '').trim();

    try {
      if (!effectiveHash) {
        throw new Error('Please provide the BSC transaction hash (TxID).');
      }

      // Automatically verify and credit on-chain
      const result = await DepositService.verifyAndCreditDeposit({
        txHash: effectiveHash,
        userId
      });

      return res.redirect(`/deposit?success=${encodeURIComponent(result.message || 'USDT deposit confirmed and credited!')}`);
    } catch (err) {
      return res.redirect(`/deposit?error=${encodeURIComponent(err.message)}`);
    }
  }

  /**
   * Explicit Verify Deposit Tx Route
   */
  static async verifyDepositTx(req, res) {
    const userId = req.user.id;
    const { txHash, depositId } = req.body;

    try {
      if (!txHash || !txHash.trim()) {
        throw new Error('Please provide the transaction hash (TxID).');
      }

      const result = await DepositService.verifyAndCreditDeposit({
        depositId: depositId ? parseInt(depositId, 10) : null,
        txHash: txHash.trim(),
        userId
      });

      return res.redirect(`/deposit?success=${encodeURIComponent(result.message || 'USDT (BEP-20) deposit confirmed and credited to your Main Wallet!')}`);
    } catch (err) {
      return res.redirect(`/deposit?error=${encodeURIComponent(err.message)}`);
    }
  }

  /**
   * Withdraw View (Exclusively USDT BEP-20 to Connected Wallet)
   */
  static showWithdraw(req, res) {
    const userId = req.user.id;
    const wallet = WalletService.getWallet(userId);
    const withdrawals = WithdrawalService.getUserWithdrawals(userId);
    const userVerifiedWallet = UserWalletService.getActiveWallet(userId);
    const settings = query("SELECT key, value FROM mlm_settings WHERE key IN ('withdrawal_fee_pct', 'min_withdrawal', 'max_withdrawal')");

    const limits = { feePct: 10, min: 10, max: 50000 };
    for (const s of settings) {
      if (s.key === 'withdrawal_fee_pct') limits.feePct = parseFloat(s.value);
      if (s.key === 'min_withdrawal') limits.min = parseFloat(s.value);
      if (s.key === 'max_withdrawal') limits.max = parseFloat(s.value);
    }

    res.render('dashboard/withdraw', {
      title: 'Withdraw Profits — FINVORA',
      user: req.user,
      wallet,
      withdrawableProfit: wallet.withdrawable_profit,
      withdrawals,
      limits,
      userVerifiedWallet,
      walletAddress: userVerifiedWallet ? userVerifiedWallet.walletAddress : null,
      config: BLOCKCHAIN_CONFIG,
      error: req.query.error,
      success: req.query.success
    });
  }

  /**
   * Submit Withdrawal Request (Destination strictly locked to verified connected wallet)
   */
  static submitWithdraw(req, res) {
    const userId = req.user.id;
    const { amount, profitSource } = req.body;

    try {
      const parsedAmount = parseFloat(amount);
      const selectedWallet = profitSource && ['ROI', 'REFERRAL', 'LEVEL', 'SALARY', 'PROFIT'].includes(profitSource.toUpperCase())
        ? profitSource.toUpperCase()
        : 'PROFIT';

      const result = WithdrawalService.requestWithdrawal({
        userId,
        amount: parsedAmount,
        walletType: selectedWallet
      });

      return res.redirect(`/withdraw?success=${encodeURIComponent(`Withdrawal request #${result.withdrawalCode} of $${result.requestedAmount.toFixed(2)} USDT submitted for Admin approval.`)}`);
    } catch (err) {
      return res.redirect(`/withdraw?error=${encodeURIComponent(err.message)}`);
    }
  }

  /**
   * Transactions Ledger
   */
  static showTransactions(req, res) {
    const userId = req.user.id;
    const type = req.query.type || null;
    const transactions = WalletService.getTransactions(userId, { limit: 100, type });

    res.render('dashboard/transactions', {
      title: 'Transaction History — FINVORA',
      user: req.user,
      transactions,
      selectedType: type
    });
  }

  /**
   * User Profile & Security Settings
   */
  static showProfile(req, res) {
    const userId = req.user.id;
    const profile = get('SELECT * FROM user_profiles WHERE user_id = ?', [userId]) || {};
    const security = get('SELECT * FROM user_security WHERE user_id = ?', [userId]) || {};

    res.render('dashboard/profile', {
      title: 'My Profile — FINVORA',
      user: req.user,
      profile,
      security,
      error: req.query.error,
      success: req.query.success
    });
  }

  /**
   * Update Profile
   */
  static updateProfile(req, res) {
    const userId = req.user.id;
    const { fullName, mobile, walletAddress, bankDetails, bio } = req.body;

    run('UPDATE users SET full_name = ?, mobile = ? WHERE id = ?', [fullName, mobile, userId]);
    run(`
      INSERT INTO user_profiles (user_id, wallet_address, bank_details, bio)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        wallet_address = excluded.wallet_address,
        bank_details = excluded.bank_details,
        bio = excluded.bio,
        updated_at = CURRENT_TIMESTAMP
    `, [userId, walletAddress, bankDetails, bio]);

    return res.redirect('/profile?success=Profile%20updated%20successfully');
  }

  /**
   * API Endpoint: Visual Tree Data
   */
  static getTreeJson(req, res) {
    const userId = parseInt(req.query.userId || req.user.id, 10);
    const tree = GenealogyService.getVisualTree(userId, 3);
    res.json({ success: true, data: tree });
  }
}

module.exports = UserDashboardController;
