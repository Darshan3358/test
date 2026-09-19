const { db, query, get, run, transaction } = require('../database/db');
const WalletService = require('./WalletService');
const IncomeCapService = require('./IncomeCapService');

class SalaryService {
  /**
   * Record new direct business from a sponsored referral purchase
   */
  static recordDirectBusiness({ sponsorId, buyerId, amount, investmentId = null }) {
    if (amount <= 0) return;

    return transaction(() => {
      run(`
        INSERT INTO salary_business_ledger (user_id, investment_id, from_user_id, amount, status)
        VALUES (?, ?, ?, ?, 'QUALIFIED')
      `, [sponsorId, investmentId, buyerId, amount]);

      // Check if this new business qualifies the sponsor for a new salary level
      return this.checkAndActivateSalary(sponsorId);
    });
  }

  /**
   * Get total cumulative and unallocated direct business for a user
   */
  static getDirectBusinessSummary(userId) {
    const totalRow = get(`
      SELECT COALESCE(SUM(amount), 0) as total_business
      FROM salary_business_ledger
      WHERE user_id = ? AND status = 'QUALIFIED'
    `, [userId]);

    const totalBusiness = totalRow ? Number(totalRow.total_business) : 0;

    // Check active salary level
    const activeSalary = get(`
      SELECT usl.*, st.required_direct_business
      FROM user_salary_levels usl
      JOIN salary_targets st ON st.id = usl.target_id
      WHERE usl.user_id = ? AND usl.status = 'ACTIVE'
      ORDER BY usl.id DESC LIMIT 1
    `, [userId]);

    // Check next target
    let nextTarget = null;
    if (activeSalary) {
      nextTarget = get(`
        SELECT * FROM salary_targets
        WHERE required_direct_business > ? AND status = 'ACTIVE'
        ORDER BY required_direct_business ASC LIMIT 1
      `, [activeSalary.required_direct_business]);
    } else {
      nextTarget = get(`
        SELECT * FROM salary_targets
        WHERE required_direct_business > ? AND status = 'ACTIVE'
        ORDER BY required_direct_business ASC LIMIT 1
      `, [totalBusiness]);
    }

    const consumedBusiness = activeSalary ? Number(activeSalary.required_direct_business) : 0;
    const requiredNext = nextTarget ? Number(nextTarget.required_direct_business) : 0;
    const additionalRequired = Math.max(0, requiredNext - totalBusiness);

    return {
      totalBusiness,
      consumedBusiness,
      activeSalary,
      nextTarget,
      additionalRequired
    };
  }

  /**
   * Check if user qualifies for an upgraded or new salary level.
   * Enforces:
   * 1. Only ONE active salary level at a time.
   * 2. Achieving next target stops previous salary and starts new 25-week plan.
   * 3. Incremental accounting based on cumulative direct business.
   */
  static checkAndActivateSalary(userId) {
    const totalRow = get(`
      SELECT COALESCE(SUM(amount), 0) as total_business
      FROM salary_business_ledger
      WHERE user_id = ? AND status = 'QUALIFIED'
    `, [userId]);
    const totalBusiness = totalRow ? Number(totalRow.total_business) : 0;

    // Find highest target that totalBusiness satisfies
    const eligibleTarget = get(`
      SELECT * FROM salary_targets
      WHERE required_direct_business <= ? AND status = 'ACTIVE'
      ORDER BY required_direct_business DESC LIMIT 1
    `, [totalBusiness]);

    if (!eligibleTarget) {
      return { activated: false, reason: 'Direct business below first target' };
    }

    // Check currently active or completed salary level
    const currentActive = get(`
      SELECT * FROM user_salary_levels
      WHERE user_id = ? AND status = 'ACTIVE'
      ORDER BY id DESC LIMIT 1
    `, [userId]);

    if (currentActive && currentActive.target_id === eligibleTarget.id) {
      return { activated: false, reason: 'Already active on this target' };
    }

    // Check if target was previously achieved
    const previouslyAchieved = get(`
      SELECT * FROM user_salary_levels
      WHERE user_id = ? AND target_id = ? AND status IN ('ACTIVE', 'COMPLETED')
    `, [userId, eligibleTarget.id]);

    if (previouslyAchieved) {
      return { activated: false, reason: 'Target already achieved previously' };
    }

    return transaction(() => {
      // Rule: STOP previous salary level immediately
      if (currentActive) {
        run(`
          UPDATE user_salary_levels
          SET status = 'STOPPED',
              stopped_reason = ?
          WHERE id = ?
        `, [`Upgraded to ${eligibleTarget.target_name}`, currentActive.id]);
        console.log(`[SalaryService] User ${userId} upgraded: Stopped salary level ${currentActive.id}`);
      }

      // Activate new 25-week salary level
      const today = new Date().toISOString().slice(0, 10);
      const res = run(`
        INSERT INTO user_salary_levels (
          user_id, target_id, target_name, weekly_amount, duration_weeks,
          paid_weeks, start_date, status
        ) VALUES (?, ?, ?, ?, ?, 0, ?, 'ACTIVE')
      `, [
        userId,
        eligibleTarget.id,
        eligibleTarget.target_name,
        eligibleTarget.weekly_amount,
        eligibleTarget.duration_weeks || 25,
        today
      ]);

      // Update allocated business in ledger
      run(`
        UPDATE salary_business_ledger
        SET allocated_to_target_id = ?
        WHERE user_id = ? AND allocated_to_target_id IS NULL
      `, [eligibleTarget.id, userId]);

      console.log(`[SalaryService] Activated new salary level ${res.lastInsertRowid} for user ${userId}: $${eligibleTarget.weekly_amount}/wk for 25 weeks`);

      return {
        activated: true,
        userSalaryId: res.lastInsertRowid,
        targetName: eligibleTarget.target_name,
        weeklyAmount: eligibleTarget.weekly_amount,
        durationWeeks: eligibleTarget.duration_weeks || 25
      };
    });
  }

  /**
   * Process weekly salary payouts for all active user salary levels.
   * Strictly idempotent: checks user_salary_id and week_number.
   */
  static processWeeklySalary() {
    const today = new Date().toISOString().slice(0, 10);
    console.log(`[SalaryService] Processing weekly salary payouts for: ${today}`);

    const activeSalaries = query(`
      SELECT usl.*, u.username, u.user_code, u.status as user_status
      FROM user_salary_levels usl
      JOIN users u ON u.id = usl.user_id
      WHERE usl.status = 'ACTIVE' AND u.status = 'ACTIVE'
    `);

    let processedCount = 0;
    let totalPayout = 0;
    const recipients = [];
    const errors = [];

    for (const salary of activeSalaries) {
      try {
        if (salary.paid_weeks >= salary.duration_weeks) {
          run("UPDATE user_salary_levels SET status = 'COMPLETED' WHERE id = ?", [salary.id]);
          continue;
        }

        // Idempotency check 1: has salary already been paid for this contract today?
        const paidToday = get(`
          SELECT id FROM salary_payouts
          WHERE user_salary_id = ? AND payout_date = ?
        `, [salary.id, today]);

        if (paidToday) {
          continue; // Already paid for today's cycle
        }

        const nextWeekNumber = Number(salary.paid_weeks) + 1;

        // Idempotency check 2: has this specific week number been paid already?
        const existing = get(`
          SELECT id FROM salary_payouts
          WHERE user_salary_id = ? AND week_number = ?
        `, [salary.id, nextWeekNumber]);

        if (existing) {
          continue;
        }

        const weeklyAmount = Number(salary.weekly_amount);

        // Apply income cap check for salary income
        const capResult = IncomeCapService.applyCap(salary.user_id, weeklyAmount, 'SALARY');
        const netPayout = capResult.eligibleAmount;

        transaction(() => {
          // Record salary payout
          run(`
            INSERT INTO salary_payouts (user_salary_id, user_id, week_number, amount, payout_date, status)
            VALUES (?, ?, ?, ?, ?, 'PAID')
          `, [salary.id, salary.user_id, nextWeekNumber, netPayout, today]);

          // Credit SALARY wallet
          if (netPayout > 0) {
            WalletService.credit({
              userId: salary.user_id,
              walletType: 'SALARY',
              transactionType: 'SALARY',
              amount: netPayout,
              referenceId: `SALARY-${salary.id}-WK-${nextWeekNumber}`,
              description: `Weekly Salary payout (Week ${nextWeekNumber}/${salary.duration_weeks}) for ${salary.target_name}`
            });
          }

          const newPaidWeeks = nextWeekNumber;
          const isCompleted = newPaidWeeks >= salary.duration_weeks;

          run(`
            UPDATE user_salary_levels
            SET paid_weeks = ?,
                last_payout_date = ?,
                status = ?
            WHERE id = ?
          `, [newPaidWeeks, today, isCompleted ? 'COMPLETED' : 'ACTIVE', salary.id]);
        });

        processedCount++;
        totalPayout += netPayout;

        recipients.push({
          userId: salary.user_id,
          userCode: salary.user_code,
          username: salary.username,
          targetName: salary.target_name,
          weekNumber: nextWeekNumber,
          durationWeeks: salary.duration_weeks,
          weeklyAmount: weeklyAmount,
          netPayout: netPayout
        });
      } catch (err) {
        console.error(`[SalaryService] Error paying salary ${salary.id}:`, err);
        errors.push({ salaryId: salary.id, error: err.message });
      }
    }

    // Log cron execution
    run(`
      INSERT INTO cron_execution_logs (cron_name, execution_date, processed_count, total_payout, status, details)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [
      'WEEKLY_SALARY',
      today,
      processedCount,
      Number(totalPayout.toFixed(2)),
      errors.length === 0 ? 'SUCCESS' : 'PARTIAL_ERROR',
      JSON.stringify({ processedCount, totalPayout, errorCount: errors.length })
    ]);

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
