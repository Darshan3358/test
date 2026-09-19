const { getDb, getNextSequence } = require('../database/mongo');
const WalletService = require('./WalletService');
const IncomeCapService = require('./IncomeCapService');

class SalaryService {
  /**
   * Record new direct business from a sponsored referral purchase
   */
  static async recordDirectBusiness({ sponsorId, buyerId, amount, investmentId = null }) {
    if (amount <= 0) return;
    const db = getDb();
    const sid = Number(sponsorId);
    const bid = Number(buyerId);
    const amt = Number(amount);

    const nextId = await getNextSequence('salary_business_ledger');
    await db.collection('salary_business_ledger').insertOne({
      id: nextId,
      sqlite_id: nextId,
      user_id: sid,
      investment_id: investmentId,
      from_user_id: bid,
      amount: amt,
      status: 'QUALIFIED',
      created_at: new Date()
    });

    return await this.checkAndActivateSalary(sid);
  }

  /**
   * Get total cumulative and unallocated direct business for a user
   */
  static async getDirectBusinessSummary(userId) {
    const db = getDb();
    const uid = Number(userId);

    const ledger = await db.collection('salary_business_ledger')
      .find({ user_id: uid, status: 'QUALIFIED' })
      .toArray();

    const totalBusiness = ledger.reduce((s, row) => s + Number(row.amount || 0), 0);

    const activeSalary = await db.collection('user_salary_levels')
      .findOne({ user_id: uid, status: 'ACTIVE' }, { sort: { id: -1, _id: -1 } });

    let nextTarget = null;
    if (activeSalary) {
      const activeTarget = await db.collection('salary_targets').findOne({
        $or: [{ id: activeSalary.target_id }, { sqlite_id: activeSalary.target_id }]
      });
      const reqBiz = activeTarget ? Number(activeTarget.required_direct_business) : 0;
      activeSalary.required_direct_business = reqBiz;

      const targets = await db.collection('salary_targets')
        .find({ required_direct_business: { $gt: reqBiz }, status: 'ACTIVE' })
        .sort({ required_direct_business: 1 })
        .limit(1)
        .toArray();
      nextTarget = targets[0] || null;
    } else {
      const targets = await db.collection('salary_targets')
        .find({ required_direct_business: { $gt: totalBusiness }, status: 'ACTIVE' })
        .sort({ required_direct_business: 1 })
        .limit(1)
        .toArray();
      nextTarget = targets[0] || null;
    }

    const consumedBusiness = activeSalary ? Number(activeSalary.required_direct_business || 0) : 0;
    const requiredNext = nextTarget ? Number(nextTarget.required_direct_business || 0) : 0;
    const additionalRequired = Math.max(0, requiredNext - totalBusiness);

    return {
      totalBusiness: Number(totalBusiness.toFixed(2)),
      consumedBusiness,
      activeSalary,
      nextTarget,
      additionalRequired: Number(additionalRequired.toFixed(2))
    };
  }

  /**
   * Check if user qualifies for an upgraded or new salary level.
   */
  static async checkAndActivateSalary(userId) {
    const db = getDb();
    const uid = Number(userId);

    const ledger = await db.collection('salary_business_ledger')
      .find({ user_id: uid, status: 'QUALIFIED' })
      .toArray();
    const totalBusiness = ledger.reduce((s, row) => s + Number(row.amount || 0), 0);

    const targets = await db.collection('salary_targets')
      .find({ required_direct_business: { $lte: totalBusiness }, status: 'ACTIVE' })
      .sort({ required_direct_business: -1 })
      .limit(1)
      .toArray();
    const eligibleTarget = targets[0] || null;

    if (!eligibleTarget) {
      return { activated: false, reason: 'Direct business below first target' };
    }

    const targetId = eligibleTarget.id !== undefined ? eligibleTarget.id : eligibleTarget.sqlite_id;

    const currentActive = await db.collection('user_salary_levels')
      .findOne({ user_id: uid, status: 'ACTIVE' }, { sort: { id: -1, _id: -1 } });

    if (currentActive && currentActive.target_id === targetId) {
      return { activated: false, reason: 'Already active on this target' };
    }

    const previouslyAchieved = await db.collection('user_salary_levels')
      .findOne({ user_id: uid, target_id: targetId, status: { $in: ['ACTIVE', 'COMPLETED'] } });

    if (previouslyAchieved) {
      return { activated: false, reason: 'Target already achieved previously' };
    }

    if (currentActive) {
      await db.collection('user_salary_levels').updateOne(
        { _id: currentActive._id },
        {
          $set: {
            status: 'STOPPED',
            stopped_reason: `Upgraded to ${eligibleTarget.target_name}`,
            updated_at: new Date()
          }
        }
      );
    }

    const today = new Date().toISOString().slice(0, 10);
    const newId = await getNextSequence('user_salary_levels');
    await db.collection('user_salary_levels').insertOne({
      id: newId,
      sqlite_id: newId,
      user_id: uid,
      target_id: targetId,
      target_name: eligibleTarget.target_name,
      weekly_amount: eligibleTarget.weekly_amount,
      duration_weeks: eligibleTarget.duration_weeks || 25,
      paid_weeks: 0,
      start_date: today,
      status: 'ACTIVE',
      created_at: new Date()
    });

    await db.collection('salary_business_ledger').updateMany(
      { user_id: uid, allocated_to_target_id: null },
      { $set: { allocated_to_target_id: targetId } }
    );

    return {
      activated: true,
      userSalaryId: newId,
      targetName: eligibleTarget.target_name,
      weeklyAmount: eligibleTarget.weekly_amount,
      durationWeeks: eligibleTarget.duration_weeks || 25
    };
  }

  /**
   * Process weekly salary payouts for all active user salary levels.
   */
  static async processWeeklySalary() {
    const db = getDb();
    const today = new Date().toISOString().slice(0, 10);
    console.log(`[SalaryService] Processing weekly salary payouts for: ${today}`);

    const activeSalaries = await db.collection('user_salary_levels').find({ status: 'ACTIVE' }).toArray();

    let processedCount = 0;
    let totalPayout = 0;
    const recipients = [];
    const errors = [];

    for (const salary of activeSalaries) {
      try {
        const salId = salary.id !== undefined ? salary.id : salary.sqlite_id;
        const uid = Number(salary.user_id);

        const user = await db.collection('users').findOne({ $or: [{ id: uid }, { sqlite_id: uid }] });
        if (!user || user.status !== 'ACTIVE') continue;

        if (salary.paid_weeks >= salary.duration_weeks) {
          await db.collection('user_salary_levels').updateOne(
            { _id: salary._id },
            { $set: { status: 'COMPLETED', updated_at: new Date() } }
          );
          continue;
        }

        const paidToday = await db.collection('salary_payouts').findOne({
          user_salary_id: salId,
          payout_date: today
        });
        if (paidToday) continue;

        const nextWeekNumber = Number(salary.paid_weeks) + 1;
        const existing = await db.collection('salary_payouts').findOne({
          user_salary_id: salId,
          week_number: nextWeekNumber
        });
        if (existing) continue;

        const weeklyAmount = Number(salary.weekly_amount);
        const capResult = await IncomeCapService.applyCap(uid, weeklyAmount, 'SALARY');
        const netPayout = capResult.eligibleAmount;

        const payoutId = await getNextSequence('salary_payouts');
        await db.collection('salary_payouts').insertOne({
          id: payoutId,
          sqlite_id: payoutId,
          user_salary_id: salId,
          user_id: uid,
          week_number: nextWeekNumber,
          amount: netPayout,
          payout_date: today,
          status: 'PAID',
          created_at: new Date()
        });

        if (netPayout > 0) {
          await WalletService.credit({
            userId: uid,
            walletType: 'SALARY',
            transactionType: 'SALARY',
            amount: netPayout,
            referenceId: `SALARY-${salId}-WK-${nextWeekNumber}`,
            description: `Weekly Salary payout (Week ${nextWeekNumber}/${salary.duration_weeks}) for ${salary.target_name}`
          });
        }

        const isCompleted = nextWeekNumber >= salary.duration_weeks;
        await db.collection('user_salary_levels').updateOne(
          { _id: salary._id },
          {
            $set: {
              paid_weeks: nextWeekNumber,
              last_payout_date: today,
              status: isCompleted ? 'COMPLETED' : 'ACTIVE',
              updated_at: new Date()
            }
          }
        );

        processedCount++;
        totalPayout += netPayout;
        recipients.push({
          userId: uid,
          userCode: user.user_code,
          username: user.username,
          targetName: salary.target_name,
          weekNumber: nextWeekNumber,
          durationWeeks: salary.duration_weeks,
          weeklyAmount,
          netPayout
        });
      } catch (err) {
        console.error(`[SalaryService] Error paying salary:`, err);
        errors.push({ error: err.message });
      }
    }

    const logId = await getNextSequence('cron_execution_logs');
    await db.collection('cron_execution_logs').insertOne({
      id: logId,
      sqlite_id: logId,
      cron_name: 'WEEKLY_SALARY',
      execution_date: today,
      processed_count: processedCount,
      total_payout: Number(totalPayout.toFixed(2)),
      status: errors.length === 0 ? 'SUCCESS' : 'PARTIAL_ERROR',
      details: JSON.stringify({ processedCount, totalPayout, errorCount: errors.length }),
      created_at: new Date()
    });

    return {
      date: today,
      processedCount,
      totalPayout: Number(totalPayout.toFixed(4)),
      recipients,
      errors
    };
  }
}

module.exports = SalaryService;
