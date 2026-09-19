const bcrypt = require('bcryptjs');
const { query, get, run, transaction } = require('../database/db');
const RoiService = require('../services/RoiService');
const SalaryService = require('../services/SalaryService');
const DepositService = require('../services/DepositService');
const WithdrawalService = require('../services/WithdrawalService');
const WalletService = require('../services/WalletService');
const AccountTypeService = require('../services/AccountTypeService');
const AuditService = require('../services/AuditService');
const BlockchainService = require('../services/BlockchainService');
const BlockchainSignerService = require('../services/BlockchainSignerService');
const AdminWalletService = require('../services/AdminWalletService');
const DepositMonitorService = require('../services/DepositMonitorService');
const BLOCKCHAIN_CONFIG = require('../config/blockchain');

class AdminController {
  /**
   * Admin Dashboard KPIs and Analytics
   */
  static showDashboard(req, res) {
    // Platform KPIs
    const userStats = get(`
      SELECT 
        COUNT(*) as total_users,
        SUM(CASE WHEN status = 'ACTIVE' THEN 1 ELSE 0 END) as active_users,
        SUM(CASE WHEN status != 'ACTIVE' THEN 1 ELSE 0 END) as inactive_users,
        SUM(CASE WHEN user_type = 'WORKING' THEN 1 ELSE 0 END) as working_users,
        SUM(CASE WHEN user_type = 'INVESTOR' THEN 1 ELSE 0 END) as investor_users,
        SUM(CASE WHEN user_type = 'ACTIVE' THEN 1 ELSE 0 END) as normal_active_users,
        SUM(CASE WHEN user_type = 'SUSPENDED' THEN 1 ELSE 0 END) as suspended_users
      FROM users WHERE role = 'USER'
    `);

    const invStats = get(`
      SELECT 
        COUNT(*) as total_investments,
        SUM(CASE WHEN status = 'ACTIVE' THEN 1 ELSE 0 END) as active_investments,
        COALESCE(SUM(amount), 0) as total_invested_amount
      FROM investments
    `);

    const today = new Date().toISOString().slice(0, 10);
    const todayRoi = get('SELECT COALESCE(SUM(net_amount), 0) as amount FROM daily_roi_ledger WHERE roi_date = ?', [today]);
    const totalRoi = get('SELECT COALESCE(SUM(net_amount), 0) as amount FROM daily_roi_ledger');
    const totalRef = get('SELECT COALESCE(SUM(net_amount), 0) as amount FROM referral_commissions');
    const totalLvl = get('SELECT COALESCE(SUM(net_amount), 0) as amount FROM level_commissions');
    const totalSal = get('SELECT COALESCE(SUM(amount), 0) as amount FROM salary_payouts');

    const depStats = get(`
      SELECT 
        COALESCE(SUM(CASE WHEN status = 'APPROVED' THEN amount ELSE 0 END), 0) as total_approved,
        COALESCE(SUM(CASE WHEN status = 'PENDING' THEN amount ELSE 0 END), 0) as total_pending,
        COUNT(CASE WHEN status = 'PENDING' THEN 1 END) as pending_count
      FROM deposits
    `);

    const wdStats = get(`
      SELECT 
        COALESCE(SUM(CASE WHEN status = 'APPROVED' THEN net_amount ELSE 0 END), 0) as total_paid,
        COALESCE(SUM(CASE WHEN status = 'APPROVED' THEN fee_amount ELSE 0 END), 0) as total_fees,
        COALESCE(SUM(CASE WHEN status = 'PENDING' THEN requested_amount ELSE 0 END), 0) as pending_amount,
        COUNT(CASE WHEN status = 'PENDING' THEN 1 END) as pending_count
      FROM withdrawals
    `);

    const recentUsers = query(`
      SELECT u.id, u.user_code, u.username, u.email, u.user_type, u.status, u.created_at,
             COALESCE(SUM(inv.amount), 0) as invested
      FROM users u
      LEFT JOIN investments inv ON inv.user_id = u.id AND inv.status = 'ACTIVE'
      WHERE u.role = 'USER'
      GROUP BY u.id
      ORDER BY u.id DESC LIMIT 8
    `);

    const pendingWithdrawals = query(`
      SELECT w.*, u.username, u.email, u.user_code
      FROM withdrawals w
      JOIN users u ON u.id = w.user_id
      WHERE w.status = 'PENDING'
      ORDER BY w.id DESC LIMIT 5
    `);

    const pendingDeposits = query(`
      SELECT d.*, u.username, u.email, u.user_code
      FROM deposits d
      JOIN users u ON u.id = d.user_id
      WHERE d.status = 'PENDING'
      ORDER BY d.id DESC LIMIT 5
    `);

    res.render('admin/dashboard', {
      title: 'Admin Console — FINVORA',
      user: req.user,
      stats: {
        users: userStats,
        investments: invStats,
        todayRoi: Number(todayRoi?.amount || 0),
        totalRoi: Number(totalRoi?.amount || 0),
        totalReferral: Number(totalRef?.amount || 0),
        totalLevel: Number(totalLvl?.amount || 0),
        totalSalary: Number(totalSal?.amount || 0),
        deposits: depStats,
        withdrawals: wdStats
      },
      recentUsers,
      pendingWithdrawals,
      pendingDeposits,
      success: req.query.success,
      error: req.query.error
    });
  }

  /**
   * Manage Users
   */
  static showUsers(req, res) {
    const search = req.query.q || '';
    const status = req.query.status || '';
    const userType = req.query.type || '';

    let sql = `
      SELECT u.*, sp.username as sponsor_username,
             COALESCE(SUM(inv.amount), 0) as total_invested,
             w.main_balance, w.roi_balance, w.referral_balance, w.level_balance, w.salary_balance
      FROM users u
      LEFT JOIN users sp ON sp.id = u.sponsor_id
      LEFT JOIN investments inv ON inv.user_id = u.id AND inv.status = 'ACTIVE'
      LEFT JOIN wallets w ON w.user_id = u.id
      WHERE u.role = 'USER'
    `;
    const params = [];

    if (search) {
      sql += ' AND (u.username LIKE ? OR u.email LIKE ? OR u.user_code LIKE ? OR u.full_name LIKE ?)';
      const s = `%${search}%`;
      params.push(s, s, s, s);
    }
    if (status) {
      sql += ' AND u.status = ?';
      params.push(status);
    }
    if (userType) {
      sql += ' AND u.user_type = ?';
      params.push(userType);
    }

    sql += ' GROUP BY u.id ORDER BY u.id DESC LIMIT 100';

    const users = query(sql, params);

    res.render('admin/users', {
      title: 'User Management — FINVORA Admin',
      user: req.user,
      users,
      search,
      status,
      userType,
      success: req.query.success,
      error: req.query.error
    });
  }

  /**
   * User Details
   */
  static showUserDetails(req, res) {
    const targetUserId = parseInt(req.params.id, 10);
    const targetUser = get(`
      SELECT u.*, sp.username as sponsor_username, sp.user_code as sponsor_code
      FROM users u
      LEFT JOIN users sp ON sp.id = u.sponsor_id
      WHERE u.id = ?
    `, [targetUserId]);

    if (!targetUser) return res.redirect('/SLXadmin/users?error=User%20not%20found');

    const profile = get('SELECT * FROM user_profiles WHERE user_id = ?', [targetUserId]) || {};
    const wallet = WalletService.getWallet(targetUserId);
    const investments = query('SELECT * FROM investments WHERE user_id = ? ORDER BY id DESC', [targetUserId]);
    const transactions = WalletService.getTransactions(targetUserId, { limit: 20 });
    const directReferrals = query('SELECT * FROM users WHERE sponsor_id = ? ORDER BY id DESC', [targetUserId]);

    res.render('admin/user-details', {
      title: `User: ${targetUser.username} — FINVORA Admin`,
      user: req.user,
      targetUser,
      profile,
      wallet,
      investments,
      transactions,
      directReferrals,
      success: req.query.success,
      error: req.query.error
    });
  }

  /**
   * Update User Status / Type / Password
   */
  static updateUser(req, res) {
    const targetUserId = parseInt(req.params.id, 10);
    const { status, userType, newPassword } = req.body;

    const currentUser = get('SELECT * FROM users WHERE id = ?', [targetUserId]);
    if (!currentUser) return res.redirect('/SLXadmin/users?error=User%20not%20found');

    if (status) {
      if (status === 'SUSPENDED' && currentUser.status !== 'SUSPENDED') {
        AccountTypeService.suspendUser(targetUserId);
      } else if (status === 'ACTIVE' && currentUser.status === 'SUSPENDED') {
        AccountTypeService.unsuspendUser(targetUserId);
      } else {
        run('UPDATE users SET status = ? WHERE id = ?', [status, targetUserId]);
      }

      AuditService.log({
        actorId: req.user.id,
        actorName: req.user.username,
        actorRole: 'ADMIN',
        action: 'UPDATE_USER_STATUS',
        targetType: 'USER',
        targetId: targetUserId,
        details: { newStatus: status },
        ipAddress: req.ip
      });
    }

    if (userType) {
      if (userType === 'SUSPENDED') {
        AccountTypeService.suspendUser(targetUserId);
      } else {
        if (currentUser.status === 'SUSPENDED') {
          run("UPDATE users SET status = 'ACTIVE' WHERE id = ?", [targetUserId]);
        }
        run('UPDATE users SET user_type = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [userType, targetUserId]);
        if (userType === 'WORKING') {
          run(`
            UPDATE investments
            SET multiplier = 3.0, max_income_cap = amount * 3.0
            WHERE user_id = ? AND status = 'ACTIVE' AND multiplier < 3.0
          `, [targetUserId]);
        }
      }

      AuditService.log({
        actorId: req.user.id,
        actorName: req.user.username,
        actorRole: 'ADMIN',
        action: 'UPDATE_USER_TYPE',
        targetType: 'USER',
        targetId: targetUserId,
        details: { newUserType: userType },
        ipAddress: req.ip
      });
    }

    if (newPassword && newPassword.trim().length >= 6) {
      const hash = bcrypt.hashSync(newPassword.trim(), 10);
      run('UPDATE users SET password_hash = ? WHERE id = ?', [hash, targetUserId]);
      AuditService.log({
        actorId: req.user.id,
        actorName: req.user.username,
        actorRole: 'ADMIN',
        action: 'RESET_USER_PASSWORD',
        targetType: 'USER',
        targetId: targetUserId,
        ipAddress: req.ip
      });
    }

    return res.redirect(`/SLXadmin/users/${targetUserId}?success=User%20updated%20successfully`);
  }

  /**
   * Package Management
   */
  static showPackages(req, res) {
    const packages = query('SELECT * FROM packages ORDER BY id ASC');

    res.render('admin/packages', {
      title: 'Packages Management — FINVORA Admin',
      user: req.user,
      packages,
      success: req.query.success,
      error: req.query.error
    });
  }

  /**
   * Update / Add Package
   */
  static savePackage(req, res) {
    const { id, name, code, price, dailyRoiPct, maxMultiplier, status } = req.body;

    if (id) {
      // Update package
      run(`
        UPDATE packages
        SET name = ?, code = ?, price = ?, daily_roi_pct = ?, max_multiplier = ?, status = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [name, code, parseFloat(price), parseFloat(dailyRoiPct), parseFloat(maxMultiplier), status, id]);
    } else {
      // Create new package
      run(`
        INSERT INTO packages (name, code, price, daily_roi_pct, max_multiplier, status)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [name, code, parseFloat(price), parseFloat(dailyRoiPct), parseFloat(maxMultiplier), status || 'ACTIVE']);
    }

    AuditService.log({
      actorId: req.user.id,
      actorName: req.user.username,
      actorRole: 'ADMIN',
      action: 'PACKAGE_SAVED',
      details: { name, code, price, dailyRoiPct },
      ipAddress: req.ip
    });

    return res.redirect('/SLXadmin/packages?success=Package%20saved%20successfully');
  }

  /**
   * Deposits Review & Approval
   */
  static showDeposits(req, res) {
    const deposits = DepositService.getAllDeposits({ limit: 100 });

    res.render('admin/deposits', {
      title: 'Deposits Management — FINVORA Admin',
      user: req.user,
      deposits,
      success: req.query.success,
      error: req.query.error
    });
  }

  static approveDeposit(req, res) {
    const id = parseInt(req.params.id, 10);
    const note = req.body.note || 'Approved by Admin';

    try {
      DepositService.approveDeposit(id, note);
      AuditService.log({
        actorId: req.user.id,
        actorName: req.user.username,
        actorRole: 'ADMIN',
        action: 'DEPOSIT_APPROVED',
        targetType: 'DEPOSIT',
        targetId: id,
        details: { note },
        ipAddress: req.ip
      });
      return res.redirect('/SLXadmin/deposits?success=Deposit%20approved%20and%20credited');
    } catch (err) {
      return res.redirect(`/SLXadmin/deposits?error=${encodeURIComponent(err.message)}`);
    }
  }

  static rejectDeposit(req, res) {
    const id = parseInt(req.params.id, 10);
    const note = req.body.note || 'Rejected by Admin';

    DepositService.rejectDeposit(id, note);
    AuditService.log({
      actorId: req.user.id,
      actorName: req.user.username,
      actorRole: 'ADMIN',
      action: 'DEPOSIT_REJECTED',
      targetType: 'DEPOSIT',
      targetId: id,
      details: { note },
      ipAddress: req.ip
    });
    return res.redirect('/SLXadmin/deposits?success=Deposit%20rejected');
  }

  /**
   * Withdrawals Review & Approval
   */
  static showWithdrawals(req, res) {
    const withdrawals = WithdrawalService.getAllWithdrawals({ limit: 100 });

    res.render('admin/withdrawals', {
      title: 'Withdrawals Management — FINVORA Admin',
      user: req.user,
      withdrawals,
      success: req.query.success,
      error: req.query.error
    });
  }

  static async approveWithdrawal(req, res) {
    const id = parseInt(req.params.id, 10);
    const note = req.body.note || 'Payout processed';

    try {
      if (BlockchainSignerService.isConfigured()) {
        const result = await WithdrawalService.approveAndSendWithdrawal({
          withdrawalId: id,
          adminId: req.user.id,
          adminName: req.user.username,
          ipAddress: req.ip
        });
        return res.redirect(`/SLXadmin/withdrawals?success=${encodeURIComponent(`Withdrawal #${id} broadcasted to BSC! TxID: ${result.txHash}`)}`);
      } else {
        WithdrawalService.approveWithdrawal(id, note);
        AuditService.log({
          actorId: req.user.id,
          actorName: req.user.username,
          actorRole: 'ADMIN',
          action: 'WITHDRAWAL_APPROVED',
          targetType: 'WITHDRAWAL',
          targetId: id,
          details: { note },
          ipAddress: req.ip
        });
        return res.redirect('/SLXadmin/withdrawals?success=Withdrawal%20marked%20approved%20(Development%20Mode:%20No%20WITHDRAWAL_SIGNER_PRIVATE_KEY%20configured)');
      }
    } catch (err) {
      return res.redirect(`/SLXadmin/withdrawals?error=${encodeURIComponent(err.message)}`);
    }
  }

  static rejectWithdrawal(req, res) {
    const id = parseInt(req.params.id, 10);
    const note = req.body.note || 'Rejected by Admin';

    try {
      WithdrawalService.rejectWithdrawal(id, note, req.user.id, req.user.username);
      return res.redirect('/SLXadmin/withdrawals?success=Withdrawal%20rejected%20and%20refunded%20to%20user');
    } catch (err) {
      return res.redirect(`/SLXadmin/withdrawals?error=${encodeURIComponent(err.message)}`);
    }
  }

  /**
   * MLM Settings & Configurations
   */
  static showSettings(req, res) {
    const settingsRows = query('SELECT * FROM mlm_settings ORDER BY key ASC');
    const settings = {};
    for (const s of settingsRows) {
      settings[s.key] = s.value;
    }

    const cronLogs = query('SELECT * FROM cron_execution_logs ORDER BY id DESC LIMIT 20');

    res.render('admin/settings', {
      title: 'System & MLM Settings — FINVORA Admin',
      user: req.user,
      settings,
      cronLogs,
      success: req.query.success,
      error: req.query.error
    });
  }

  /**
   * Save MLM Settings
   */
  static updateSettings(req, res) {
    const entries = Object.entries(req.body);

    transaction(() => {
      for (const [key, value] of entries) {
        if (key.startsWith('_')) continue; // skip csrf etc
        run(`
          INSERT INTO mlm_settings (key, value, updated_at)
          VALUES (?, ?, CURRENT_TIMESTAMP)
          ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
        `, [key, String(value)]);
      }
    });

    AuditService.log({
      actorId: req.user.id,
      actorName: req.user.username,
      actorRole: 'ADMIN',
      action: 'SETTINGS_UPDATED',
      details: req.body,
      ipAddress: req.ip
    });

    return res.redirect('/SLXadmin/settings?success=Settings%20updated%20successfully');
  }

  /**
   * Manual Trigger for Daily ROI Cron
   */
  static triggerRoiCron(req, res) {
    const result = RoiService.processDailyRoi();
    return res.redirect(`/SLXadmin/settings?success=${encodeURIComponent(`Daily ROI processed for ${result.processedCount} active investments ($${result.totalNetRoi.toFixed(2)})`)}`);
  }

  /**
   * Manual Trigger for Weekly Salary Cron
   */
  static triggerSalaryCron(req, res) {
    const result = SalaryService.processWeeklySalary();
    return res.redirect(`/SLXadmin/settings?success=${encodeURIComponent(`Weekly salary processed for ${result.processedCount} users ($${result.totalPayout.toFixed(2)})`)}`);
  }

  /**
   * Audit Logs View
   */
  static showAuditLogs(req, res) {
    const logs = AuditService.getLogs({ limit: 100 });
    res.render('admin/audit-logs', {
      title: 'Security Audit Trail — FINVORA Admin',
      user: req.user,
      logs
    });
  }

  /**
   * Admin Blockchain Monitor Dashboard
   */
  static async showBlockchainMonitor(req, res) {
    try {
      const singleActiveAdminWallet = AdminWalletService.getActiveAdminWallet();
      const activeDepositWallet = singleActiveAdminWallet;
      const activeWithdrawalWallet = singleActiveAdminWallet;
      const lastProcessedBlock = 0;

      // Parallel fetch of non-blocking on-chain data
      const [currentBlock, walletBalances, signerAddress, adminWalletStatus] = await Promise.all([
        BlockchainService.getLatestBlockNumber().catch(() => 0),
        BlockchainService.getWalletBalances(singleActiveAdminWallet).catch(() => ({ bnb: 0, usdt: 0 })),
        BlockchainSignerService.getSignerAddress().catch(() => null),
        AdminWalletService.getAdminWalletStatus().catch(() => ({ isVerified: false, onChainBalances: { bnb: 0, usdt: 0 } }))
      ]);

      const deposits = DepositService.getAllDeposits({ limit: 50 });
      const withdrawals = WithdrawalService.getAllWithdrawals({ limit: 50 });
      const pendingApprovalWithdrawals = WithdrawalService.getAllWithdrawals({ status: 'PENDING_ADMIN_APPROVAL', limit: 25 });
      const walletHistory = AdminWalletService.getWalletHistory();

      // KPI counts
      const pendingDepositsCount = get("SELECT COUNT(*) as count FROM deposits WHERE status = 'PENDING'")?.count || 0;
      const processingWithdrawalsCount = get("SELECT COUNT(*) as count FROM withdrawals WHERE status IN ('PENDING', 'PENDING_ADMIN_APPROVAL', 'PROCESSING', 'REVIEW_REQUIRED')")?.count || 0;
      const completedWithdrawalsCount = get("SELECT COUNT(*) as count FROM withdrawals WHERE status = 'COMPLETED'")?.count || 0;
      const failedTxsCount = get("SELECT COUNT(*) as count FROM withdrawals WHERE status = 'FAILED'")?.count || 0;

      res.render('admin/blockchain-monitor', {
        title: 'Blockchain Monitor (USDT BEP-20) — FINVORA Admin',
        user: req.user,
        config: BLOCKCHAIN_CONFIG,
        currentBlock,
        lastProcessedBlock,
        singleActiveAdminWallet,
        activeDepositWallet,
        activeWithdrawalWallet,
        adminWalletStatus,
        walletBalances,
        depBalances: walletBalances,
        wdBalances: walletBalances,
        signerAddress,
        signerConfigured: BlockchainSignerService.isConfigured(),
        deposits,
        withdrawals,
        pendingApprovalWithdrawals,
        walletHistory,
        kpi: {
          pendingDeposits: pendingDepositsCount,
          processingWithdrawals: processingWithdrawalsCount,
          completedWithdrawals: completedWithdrawalsCount,
          failedTxs: failedTxsCount
        },
        success: req.query.success,
        error: req.query.error
      });
    } catch (err) {
      console.error('[AdminController] showBlockchainMonitor error:', err);
      res.render('admin/blockchain-monitor', {
        title: 'Blockchain Monitor — FINVORA Admin',
        user: req.user,
        config: BLOCKCHAIN_CONFIG,
        currentBlock: 0,
        lastProcessedBlock: 0,
        singleActiveAdminWallet: AdminWalletService.getActiveAdminWallet(),
        activeDepositWallet: AdminWalletService.getActiveAdminWallet(),
        activeWithdrawalWallet: AdminWalletService.getActiveAdminWallet(),
        adminWalletStatus: { isVerified: false, onChainBalances: { bnb: 0, usdt: 0 } },
        walletBalances: { bnb: 0, usdt: 0 },
        depBalances: { bnb: 0, usdt: 0 },
        wdBalances: { bnb: 0, usdt: 0 },
        signerAddress: null,
        signerConfigured: false,
        deposits: [],
        withdrawals: [],
        pendingApprovalWithdrawals: [],
        walletHistory: { active: [], historical: [] },
        kpi: { pendingDeposits: 0, processingWithdrawals: 0, completedWithdrawals: 0, failedTxs: 0 },
      });
    }
  }

  /**
   * Update Active Deposit or Withdrawal Wallet (Disabled - Manual Updates Not Allowed)
   */
  static updateAdminWallet(req, res) {
    return res.redirect(`/SLXadmin/blockchain-monitor?error=${encodeURIComponent('Manual wallet address updates are disabled. Please connect or switch the admin wallet securely via Web3.')}`);
  }
}

module.exports = AdminController;

