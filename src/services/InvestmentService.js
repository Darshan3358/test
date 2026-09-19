const { db, query, get, run, transaction } = require('../database/db');
const WalletService = require('./WalletService');
const IncomeCapService = require('./IncomeCapService');
const ReferralCommissionService = require('./ReferralCommissionService');
const SalaryService = require('./SalaryService');
const LevelUnlockService = require('./LevelUnlockService');
const AccountTypeService = require('./AccountTypeService');

class InvestmentService {
  /**
   * Purchase and activate a package for a user.
   * Transactional:
   * 1. Check user wallet balance and package details.
   * 2. Debit MAIN wallet with PACKAGE_PURCHASE ledger transaction.
   * 3. Determine dynamic account type & multiplier (Working 3X, Investor/Active 2X).
   * 4. Create investment record.
   * 5. Trigger ReferralCommissionService (One-time 5-level referral commissions: 5%, 2%, 1%, 1%, 1%).
   * 6. Record direct business for sponsor and check salary upgrade.
   * 7. Recalculate sponsor level unlock.
   * 8. Synchronize buyer and sponsor dynamic account types (Active -> Investor -> Working).
   */
  static purchasePackage({ userId, packageId, paymentMethod = 'WALLET' }) {
    const user = get('SELECT id, user_code, username, sponsor_id, user_type, status FROM users WHERE id = ?', [userId]);
    if (!user) throw new Error('User not found');
    if (user.status !== 'ACTIVE') throw new Error('Account is suspended or inactive');

    const pkg = get("SELECT * FROM packages WHERE id = ? AND status = 'ACTIVE'", [packageId]);
    if (!pkg) throw new Error('Selected package is not available');

    const packagePrice = Number(pkg.price);
    const effectiveType = AccountTypeService.evaluateAccountType(user);
    const multiplier = IncomeCapService.getUserMultiplier(effectiveType);
    const maxIncomeCap = Number((packagePrice * multiplier).toFixed(4));
    const dailyRoiPct = Number(pkg.daily_roi_pct || 2.0);

    return transaction(() => {
      // 1. Debit user wallet
      WalletService.debit({
        userId,
        walletType: 'MAIN',
        transactionType: 'PACKAGE_PURCHASE',
        amount: packagePrice,
        referenceId: `PKG-${pkg.code}`,
        description: `Purchase of package ${pkg.name} (${pkg.code}) for $${packagePrice.toFixed(2)}`
      });

      // 2. Create investment
      const invResult = run(`
        INSERT INTO investments (
          user_id, package_id, package_name, package_code, amount,
          daily_roi_pct, multiplier, max_income_cap, total_roi_earned, total_income_earned,
          status, activated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0.0, 0.0, 'ACTIVE', CURRENT_TIMESTAMP)
      `, [
        userId,
        pkg.id,
        pkg.name,
        pkg.code,
        packagePrice,
        dailyRoiPct,
        multiplier,
        maxIncomeCap
      ]);

      const investmentId = invResult.lastInsertRowid;

      // Asynchronously sync to MongoDB Atlas
      try {
        const { syncToMongo } = require('../database/mongo_sync');
        syncToMongo('investments', 'update', { sqlite_id: investmentId }, {
          sqlite_id: investmentId,
          user_id: userId,
          package_id: pkg.id,
          package_name: pkg.name,
          package_code: pkg.code,
          amount: packagePrice,
          daily_roi_pct: dailyRoiPct,
          multiplier,
          max_income_cap: maxIncomeCap,
          total_roi_earned: 0.0,
          total_income_earned: 0.0,
          status: 'ACTIVE',
          activated_at: new Date()
        });
      } catch (_) {}

      // 3. Process one-time referral commissions across 5 levels (5%, 2%, 1%, 1%, 1%)
      const refComm = ReferralCommissionService.processReferralCommission({
        investmentId,
        buyerUserId: userId,
        packageAmount: packagePrice
      });

      // 4. Update sponsor's direct business and check salary upgrade
      if (user.sponsor_id) {
        SalaryService.recordDirectBusiness({
          sponsorId: user.sponsor_id,
          buyerId: userId,
          amount: packagePrice,
          investmentId
        });

        // 5. Recalculate level unlock for sponsor
        LevelUnlockService.recalculate(user.sponsor_id);
      }

      // Also recalculate level unlock for current user in case they need state sync
      LevelUnlockService.recalculate(userId);

      // 6. Synchronize buyer account type (transitions from ACTIVE to INVESTOR/WORKING)
      AccountTypeService.syncUserType(userId);

      // 7. Synchronize sponsor account type (transitions to WORKING due to active direct referral)
      if (user.sponsor_id) {
        AccountTypeService.syncUserType(user.sponsor_id);
      }

      return {
        success: true,
        investmentId,
        packageName: pkg.name,
        packageCode: pkg.code,
        amount: packagePrice,
        dailyRoiPct,
        multiplier,
        maxIncomeCap,
        referralCommission: refComm
      };
    });
  }

  /**
   * Get all active and past investments for a user with individual package profit amounts
   */
  static getUserInvestments(userId) {
    return query(`
      SELECT 
        inv.*,
        COALESCE((SELECT SUM(net_amount) FROM daily_roi_ledger WHERE investment_id = inv.id), inv.total_roi_earned, 0) as profit_amount,
        (inv.amount * (inv.daily_roi_pct / 100)) as daily_profit_amount
      FROM investments inv
      WHERE inv.user_id = ?
      ORDER BY inv.id DESC
    `, [userId]);
  }

  /**
   * Get investment summary for user dashboard
   */
  static getInvestmentSummary(userId) {
    const row = get(`
      SELECT 
        COUNT(*) as total_investments,
        COALESCE(SUM(amount), 0) as total_invested,
        COALESCE(SUM(total_roi_earned), 0) as total_roi_earned,
        COALESCE(SUM(total_income_earned), 0) as total_income_earned,
        COALESCE(SUM(max_income_cap), 0) as total_cap
      FROM investments
      WHERE user_id = ?
    `, [userId]);

    const activeRow = get(`
      SELECT 
        COUNT(*) as active_count,
        COALESCE(SUM(amount), 0) as active_invested,
        COALESCE(SUM(amount * (daily_roi_pct / 100)), 0) as estimated_daily_roi
      FROM investments
      WHERE user_id = ? AND status = 'ACTIVE'
    `, [userId]);

    return {
      totalInvestments: row.total_investments || 0,
      totalInvested: Number(row.total_invested || 0),
      totalRoiEarned: Number(row.total_roi_earned || 0),
      totalIncomeEarned: Number(row.total_income_earned || 0),
      totalCap: Number(row.total_cap || 0),
      activeCount: activeRow.active_count || 0,
      activeInvested: Number(activeRow.active_invested || 0),
      estimatedDailyRoi: Number(activeRow.estimated_daily_roi || 0)
    };
  }
}

module.exports = InvestmentService;
