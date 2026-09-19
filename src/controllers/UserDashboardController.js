const { query, get, run } = require('../database/db');
const { getDb } = require('../database/mongo');
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
    try {
      const userId = Number(req.user.id);
      const wallet = await WalletService.getWallet(userId);
      const invSummary = await InvestmentService.getInvestmentSummary(userId);
      const genealogySummary = await GenealogyService.getDownlineSummary(userId);
      const salarySummary = await SalaryService.getDirectBusinessSummary(userId);
      const levelStatus = await LevelUnlockService.getLevelStatus(userId);
      const recentTxns = await WalletService.getTransactions(userId, { limit: 8 });

      // Calculate today's ROI earned
      const today = new Date().toISOString().slice(0, 10);
      const db = getDb();
      
      let todayRoi = 0;
      if (db) {
        const roiLedgers = await db.collection('daily_roi_ledger').find({
          user_id: userId,
          roi_date: today
        }).toArray();
        todayRoi = roiLedgers.reduce((s, r) => s + Number(r.net_amount || 0), 0);
      }

      // Active investments
      let activeInvestments = [];
      if (db) {
        activeInvestments = await db.collection('investments').find({
          user_id: userId,
          status: 'ACTIVE'
        }).sort({ id: -1, _id: -1 }).toArray();
      }

      // Retrieve user wallet address if already connected/linked
      let walletAddress = null;
      if (db) {
        const userProfile = await db.collection('user_profiles').findOne({ user_id: userId });
        walletAddress = userProfile ? userProfile.wallet_address : null;
      }

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
    } catch (err) {
      console.error('[UserDashboardController.showDashboard] Error:', err);
      res.status(500).send('Error loading dashboard: ' + err.message);
    }
  }

  /**
   * Packages Store
   */
  static async showPackages(req, res) {
    try {
      const userId = Number(req.user.id);
      const wallet = await WalletService.getWallet(userId);
      const db = getDb();
      const packages = await db.collection('packages').find({ status: 'ACTIVE' }).sort({ price: 1 }).toArray();

      res.render('dashboard/packages', {
        title: 'Investment Packages — FINVORA',
        user: req.user,
        wallet,
        packages,
        error: req.query.error,
        success: req.query.success
      });
    } catch (err) {
      console.error('[showPackages] Error:', err);
      res.status(500).send('Error loading packages: ' + err.message);
    }
  }

  /**
   * Purchase Package Action
   */
  static async purchasePackage(req, res) {
    const userId = Number(req.user.id);
    const { packageId } = req.body;

    try {
      const result = await InvestmentService.purchasePackage({
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
  static async showInvestments(req, res) {
    try {
      const userId = Number(req.user.id);
      const investments = await InvestmentService.getUserInvestments(userId);
      const invSummary = await InvestmentService.getInvestmentSummary(userId);

      res.render('dashboard/investments', {
        title: 'My Investments — FINVORA',
        user: req.user,
        investments,
        invSummary,
        success: req.query.success
      });
    } catch (err) {
      console.error('[showInvestments] Error:', err);
      res.status(500).send('Error loading investments: ' + err.message);
    }
  }

  /**
   * My Referrals & Affiliate Link (with Active/Inactive Status for all referred users)
   */
  static async showReferrals(req, res) {
    try {
      const userId = Number(req.user.id);
      const rawDirects = await GenealogyService.getDirectReferrals(userId);
      const downlineSummary = await GenealogyService.getDownlineSummary(userId);
      const appUrl = process.env.APP_URL || 'http://localhost:3000';

      const db = getDb();
      let walletAddress = null;
      if (db) {
        const userProfile = await db.collection('user_profiles').findOne({ user_id: userId });
        walletAddress = userProfile ? userProfile.wallet_address : null;
      }
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
    } catch (err) {
      console.error('[showReferrals] Error:', err);
      res.status(500).send('Error loading referrals: ' + err.message);
    }
  }

  /**
   * Interactive Genealogy Tree & Level Breakdown
   */
  static async showGenealogy(req, res) {
    try {
      const userId = Number(req.user.id);
      const downlineSummary = await GenealogyService.getDownlineSummary(userId);
      const levelStatus = await LevelUnlockService.getLevelStatus(userId);

      res.render('dashboard/genealogy', {
        title: 'Genealogy Network — FINVORA',
        user: req.user,
        downlineSummary,
        levelStatus
      });
    } catch (err) {
      console.error('[showGenealogy] Error:', err);
      res.status(500).send('Error loading genealogy: ' + err.message);
    }
  }

  /**
   * 20-Level ROI-on-ROI Income Report
   */
  static async showLevelIncome(req, res) {
    try {
      const userId = Number(req.user.id);
      const db = getDb();

      let commissions = [];
      let levelSummary = [];

      if (db) {
        commissions = await db.collection('level_commissions')
          .find({ upline_user_id: userId })
          .sort({ id: -1, _id: -1 })
          .limit(100)
          .toArray();

        const downlineIds = commissions.map(c => c.downline_user_id).filter(Boolean);
        const downlineUsers = await db.collection('users').find({
          $or: [{ id: { $in: downlineIds } }, { sqlite_id: { $in: downlineIds } }]
        }).toArray();
        const userMap = {};
        for (const u of downlineUsers) {
          const uId = u.id !== undefined ? u.id : u.sqlite_id;
          userMap[uId] = u;
        }
        for (const c of commissions) {
          const u = userMap[c.downline_user_id];
          c.downline_username = u ? u.username : 'N/A';
          c.downline_code = u ? u.user_code : 'N/A';
        }

        const allLevelComms = await db.collection('level_commissions').find({ upline_user_id: userId }).toArray();
        const levelMap = {};
        for (const c of allLevelComms) {
          const lvl = c.level || 1;
          if (!levelMap[lvl]) levelMap[lvl] = { level: lvl, count: 0, total_earned: 0 };
          levelMap[lvl].count++;
          levelMap[lvl].total_earned += Number(c.net_amount || 0);
        }
        levelSummary = Object.values(levelMap).sort((a, b) => a.level - b.level);
      }

      res.render('dashboard/level-income', {
        title: 'Level Income (ROI-on-ROI) — FINVORA',
        user: req.user,
        commissions,
        levelSummary
      });
    } catch (err) {
      console.error('[showLevelIncome] Error:', err);
      res.status(500).send('Error loading level income: ' + err.message);
    }
  }

  /**
   * One-Time Direct Referral Income Ledger
   */
  static async showReferralIncome(req, res) {
    try {
      const userId = Number(req.user.id);
      const db = getDb();

      let commissions = [];
      let totalEarned = 0;

      if (db) {
        commissions = await db.collection('referral_commissions')
          .find({ upline_user_id: userId })
          .sort({ id: -1, _id: -1 })
          .toArray();

        const buyerIds = commissions.map(c => c.buyer_user_id).filter(Boolean);
        const buyerUsers = await db.collection('users').find({
          $or: [{ id: { $in: buyerIds } }, { sqlite_id: { $in: buyerIds } }]
        }).toArray();
        const userMap = {};
        for (const u of buyerUsers) {
          const uId = u.id !== undefined ? u.id : u.sqlite_id;
          userMap[uId] = u;
        }
        for (const c of commissions) {
          const u = userMap[c.buyer_user_id];
          c.buyer_username = u ? u.username : 'N/A';
          c.buyer_code = u ? u.user_code : 'N/A';
          totalEarned += Number(c.net_amount || 0);
        }
      }

      res.render('dashboard/referral-income', {
        title: 'Referral Income — FINVORA',
        user: req.user,
        commissions,
        totalEarned: Number(totalEarned.toFixed(2))
      });
    } catch (err) {
      console.error('[showReferralIncome] Error:', err);
      res.status(500).send('Error loading referral income: ' + err.message);
    }
  }

  /**
   * Salary Target Plan Dashboard
   */
  static async showSalary(req, res) {
    try {
      const userId = Number(req.user.id);
      const salarySummary = await SalaryService.getDirectBusinessSummary(userId);
      const db = getDb();

      let salaryTargets = [];
      let userSalaryLevels = [];
      let payouts = [];

      if (db) {
        salaryTargets = await db.collection('salary_targets')
          .find({ status: 'ACTIVE' })
          .sort({ required_direct_business: 1 })
          .toArray();

        userSalaryLevels = await db.collection('user_salary_levels')
          .find({ user_id: userId })
          .sort({ id: -1, _id: -1 })
          .toArray();

        payouts = await db.collection('salary_payouts')
          .find({ user_id: userId })
          .sort({ id: -1, _id: -1 })
          .toArray();
      }

      res.render('dashboard/salary', {
        title: 'Salary Target Plan — FINVORA',
        user: req.user,
        salarySummary,
        salaryTargets,
        userSalaryLevels,
        payouts
      });
    } catch (err) {
      console.error('[showSalary] Error:', err);
      res.status(500).send('Error loading salary: ' + err.message);
    }
  }

  /**
   * Multi-Wallet Overview & Transfer
   */
  static async showWallet(req, res) {
    try {
      const userId = Number(req.user.id);
      const wallet = await WalletService.getWallet(userId);
      const recentTxns = await WalletService.getTransactions(userId, { limit: 20 });

      res.render('dashboard/wallet', {
        title: 'Wallets & Assets — FINVORA',
        user: req.user,
        wallet,
        recentTxns,
        error: req.query.error,
        success: req.query.success
      });
    } catch (err) {
      console.error('[showWallet] Error:', err);
      res.status(500).send('Error loading wallet: ' + err.message);
    }
  }

  /**
   * Transfer funds from sub-wallets to Main wallet
   */
  static async transferToMain(req, res) {
    const userId = Number(req.user.id);
    const { fromWallet, amount } = req.body;

    try {
      const parsedAmount = parseFloat(amount);
      await WalletService.transferToMain(userId, fromWallet, parsedAmount);
      return res.redirect(`/wallet?success=${encodeURIComponent(`Transferred $${parsedAmount.toFixed(2)} from ${fromWallet} wallet to Main wallet`)}`);
    } catch (err) {
      return res.redirect(`/wallet?error=${encodeURIComponent(err.message)}`);
    }
  }

  /**
   * Deposit View (Strictly USDT BEP-20 on BNB Smart Chain)
   */
  static async showDeposit(req, res) {
    try {
      const userId = Number(req.user.id);
      const deposits = await DepositService.getUserDeposits(userId);
      const userVerifiedWallet = await UserWalletService.getActiveWallet(userId);
      const activeAdminWallet = AdminWalletService.getActiveAdminWallet();
      const wallet = await WalletService.getWallet(userId);

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
    } catch (err) {
      console.error('[showDeposit] Error:', err);
      res.status(500).send('Error loading deposit: ' + err.message);
    }
  }

  /**
   * Submit Deposit Tx Hash or Verify
   */
  static async submitDeposit(req, res) {
    const userId = Number(req.user.id);
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
    const userId = Number(req.user.id);
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
  static async showWithdraw(req, res) {
    try {
      const userId = Number(req.user.id);
      const wallet = await WalletService.getWallet(userId);
      const withdrawals = await WithdrawalService.getUserWithdrawals(userId);
      const userVerifiedWallet = await UserWalletService.getActiveWallet(userId);
      const db = getDb();

      let limits = { feePct: 10, min: 10, max: 50000 };
      if (db) {
        const settings = await db.collection('mlm_settings').find({
          key: { $in: ['withdrawal_fee_pct', 'min_withdrawal', 'max_withdrawal'] }
        }).toArray();

        for (const s of settings) {
          if (s.key === 'withdrawal_fee_pct') limits.feePct = parseFloat(s.value);
          if (s.key === 'min_withdrawal') limits.min = parseFloat(s.value);
          if (s.key === 'max_withdrawal') limits.max = parseFloat(s.value);
        }
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
    } catch (err) {
      console.error('[showWithdraw] Error:', err);
      res.status(500).send('Error loading withdraw: ' + err.message);
    }
  }

  /**
   * Submit Withdrawal Request (Destination strictly locked to verified connected wallet)
   */
  static async submitWithdraw(req, res) {
    const userId = Number(req.user.id);
    const { amount, profitSource } = req.body;

    try {
      const parsedAmount = parseFloat(amount);
      const selectedWallet = profitSource && ['ROI', 'REFERRAL', 'LEVEL', 'SALARY', 'PROFIT'].includes(profitSource.toUpperCase())
        ? profitSource.toUpperCase()
        : 'PROFIT';

      const result = await WithdrawalService.requestWithdrawal({
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
  static async showTransactions(req, res) {
    try {
      const userId = Number(req.user.id);
      const type = req.query.type || null;
      const transactions = await WalletService.getTransactions(userId, { limit: 100, type });

      res.render('dashboard/transactions', {
        title: 'Transaction History — FINVORA',
        user: req.user,
        transactions,
        selectedType: type
      });
    } catch (err) {
      console.error('[showTransactions] Error:', err);
      res.status(500).send('Error loading transactions: ' + err.message);
    }
  }

  /**
   * User Profile & Security Settings
   */
  static async showProfile(req, res) {
    try {
      const userId = Number(req.user.id);
      const db = getDb();
      let profile = {};
      let security = {};

      if (db) {
        profile = (await db.collection('user_profiles').findOne({ user_id: userId })) || {};
        security = (await db.collection('user_security').findOne({ user_id: userId })) || {};
      }

      res.render('dashboard/profile', {
        title: 'My Profile — FINVORA',
        user: req.user,
        profile,
        security,
        error: req.query.error,
        success: req.query.success
      });
    } catch (err) {
      console.error('[showProfile] Error:', err);
      res.status(500).send('Error loading profile: ' + err.message);
    }
  }

  /**
   * Update Profile
   */
  static async updateProfile(req, res) {
    const userId = Number(req.user.id);
    const { fullName, mobile, walletAddress, bankDetails, bio } = req.body;

    try {
      const db = getDb();
      if (db) {
        await db.collection('users').updateOne(
          { $or: [{ id: userId }, { sqlite_id: userId }] },
          { $set: { full_name: fullName, mobile, updated_at: new Date() } }
        );

        await db.collection('user_profiles').updateOne(
          { user_id: userId },
          {
            $set: {
              user_id: userId,
              wallet_address: walletAddress,
              bank_details: bankDetails,
              bio,
              updated_at: new Date()
            }
          },
          { upsert: true }
        );
      }

      return res.redirect('/profile?success=Profile%20updated%20successfully');
    } catch (err) {
      return res.redirect(`/profile?error=${encodeURIComponent(err.message)}`);
    }
  }

  /**
   * API Endpoint: Visual Tree Data
   */
  static async getTreeJson(req, res) {
    try {
      const userId = parseInt(req.query.userId || req.user.id, 10);
      const tree = await GenealogyService.getVisualTree(userId, 3);
      res.json({ success: true, data: tree });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  }
}

module.exports = UserDashboardController;
