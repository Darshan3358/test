const { getDb, getNextSequence } = require('../database/mongo');
const WalletService = require('./WalletService');
const IncomeCapService = require('./IncomeCapService');
const ReferralCommissionService = require('./ReferralCommissionService');
const SalaryService = require('./SalaryService');
const LevelUnlockService = require('./LevelUnlockService');
const AccountTypeService = require('./AccountTypeService');

class InvestmentService {
  /**
   * Purchase and activate a package for a user.
   */
  static async purchasePackage({ userId, packageId, paymentMethod = 'WALLET' }) {
    const db = getDb();
    const uid = Number(userId);
    const pid = Number(packageId);

    const user = await db.collection('users').findOne({
      $or: [{ id: uid }, { sqlite_id: uid }]
    });
    if (!user) throw new Error('User not found');
    if (user.status !== 'ACTIVE') throw new Error('Account is suspended or inactive');

    const pkg = await db.collection('packages').findOne({
      $or: [{ id: pid }, { sqlite_id: pid }],
      status: 'ACTIVE'
    });
    if (!pkg) throw new Error('Selected package is not available');

    const packagePrice = Number(pkg.price);
    const effectiveType = AccountTypeService.evaluateAccountType(user);
    const multiplier = await IncomeCapService.getUserMultiplier(effectiveType);
    const maxIncomeCap = Number((packagePrice * multiplier).toFixed(4));
    const dailyRoiPct = Number(pkg.daily_roi_pct || 2.0);

    // 1. Debit user wallet
    await WalletService.debit({
      userId: uid,
      walletType: 'MAIN',
      transactionType: 'PACKAGE_PURCHASE',
      amount: packagePrice,
      referenceId: `PKG-${pkg.code}`,
      description: `Purchase of package ${pkg.name} (${pkg.code}) for $${packagePrice.toFixed(2)}`
    });

    // 2. Create investment in MongoDB
    const investmentId = await getNextSequence('investments');
    await db.collection('investments').insertOne({
      id: investmentId,
      sqlite_id: investmentId,
      user_id: uid,
      package_id: pkg.id !== undefined ? pkg.id : pkg.sqlite_id,
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

    // 3. Process referral commissions
    let refComm = null;
    try {
      refComm = await ReferralCommissionService.processReferralCommission({
        investmentId,
        buyerUserId: uid,
        packageAmount: packagePrice
      });
    } catch (e) {
      console.warn('[InvestmentService] Referral commission error:', e.message);
    }

    // 4. Update sponsor's direct business and check salary upgrade
    if (user.sponsor_id) {
      try {
        await SalaryService.recordDirectBusiness({
          sponsorId: user.sponsor_id,
          buyerId: uid,
          amount: packagePrice,
          investmentId
        });
        await LevelUnlockService.recalculate(user.sponsor_id);
      } catch (e) {
        console.warn('[InvestmentService] Sponsor update error:', e.message);
      }
    }

    try {
      await LevelUnlockService.recalculate(uid);
      await AccountTypeService.syncUserType(uid);
      if (user.sponsor_id) {
        await AccountTypeService.syncUserType(user.sponsor_id);
      }
    } catch (_) {}

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
  }

  /**
   * Get all active and past investments for a user with individual package profit amounts
   */
  static async getUserInvestments(userId) {
    const db = getDb();
    const uid = Number(userId);

    const invs = await db.collection('investments')
      .find({ user_id: uid })
      .sort({ id: -1, _id: -1 })
      .toArray();

    return invs.map(inv => {
      const amt = Number(inv.amount || 0);
      const roiPct = Number(inv.daily_roi_pct || 2.0);
      return {
        ...inv,
        id: inv.id !== undefined ? inv.id : inv.sqlite_id,
        profit_amount: Number(inv.total_roi_earned || 0),
        daily_profit_amount: Number((amt * (roiPct / 100)).toFixed(4))
      };
    });
  }

  /**
   * Get investment summary for user dashboard
   */
  static async getInvestmentSummary(userId) {
    const db = getDb();
    const uid = Number(userId);

    const allInvs = await db.collection('investments').find({ user_id: uid }).toArray();
    let totalInvested = 0;
    let totalRoiEarned = 0;
    let totalIncomeEarned = 0;
    let totalCap = 0;
    let activeCount = 0;
    let activeInvested = 0;
    let estimatedDailyRoi = 0;

    for (const inv of allInvs) {
      const amt = Number(inv.amount || 0);
      totalInvested += amt;
      totalRoiEarned += Number(inv.total_roi_earned || 0);
      totalIncomeEarned += Number(inv.total_income_earned || 0);
      totalCap += Number(inv.max_income_cap || 0);

      if (inv.status === 'ACTIVE') {
        activeCount++;
        activeInvested += amt;
        const roiPct = Number(inv.daily_roi_pct || 2.0);
        estimatedDailyRoi += amt * (roiPct / 100);
      }
    }

    return {
      totalInvestments: allInvs.length,
      totalInvested: Number(totalInvested.toFixed(2)),
      totalRoiEarned: Number(totalRoiEarned.toFixed(2)),
      totalIncomeEarned: Number(totalIncomeEarned.toFixed(2)),
      totalCap: Number(totalCap.toFixed(2)),
      activeCount,
      activeInvested: Number(activeInvested.toFixed(2)),
      estimatedDailyRoi: Number(estimatedDailyRoi.toFixed(2))
    };
  }
}

module.exports = InvestmentService;
