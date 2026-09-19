const { db, query, get, run, transaction } = require('../database/db');
const WalletService = require('./WalletService');
const IncomeCapService = require('./IncomeCapService');
const LevelCommissionService = require('./LevelCommissionService');

class RoiService {
  /**
   * Process daily 2% ROI for all active investments for a given date.
   * Ensures idempotency using the daily_roi_ledger UNIQUE(investment_id, roi_date).
   * 
   * @param {string|null} targetDate - 'YYYY-MM-DD' (defaults to current UTC/local date)
   * @returns {object} execution report
   */
  static processDailyRoi(targetDate = null) {
    const today = targetDate || new Date().toISOString().slice(0, 10);
    console.log(`[RoiService] Starting daily ROI processing for date: ${today}`);

    // Fetch active investments
    const activeInvestments = query(`
      SELECT inv.*, u.username, u.user_code, u.status as user_status, u.user_type
      FROM investments inv
      JOIN users u ON u.id = inv.user_id
      WHERE inv.status = 'ACTIVE' AND u.status = 'ACTIVE'
    `);

    let processedCount = 0;
    let skippedCount = 0;
    let totalGrossRoi = 0;
    let totalNetRoi = 0;
    let totalCappedRoi = 0;
    const recipients = [];
    const errors = [];

    for (const inv of activeInvestments) {
      try {
        // Idempotency check: has this investment already received ROI for this date?
        const existing = get(`
          SELECT id FROM daily_roi_ledger
          WHERE investment_id = ? AND roi_date = ?
        `, [inv.id, today]);

        if (existing) {
          skippedCount++;
          continue; // Already processed today
        }

        const baseAmount = Number(inv.amount);
        const roiPct = Number(inv.daily_roi_pct || 2.0);
        const grossRoi = Number(((baseAmount * roiPct) / 100).toFixed(4));

        // Evaluate against Income Cap
        const capResult = IncomeCapService.applyCap(inv.user_id, grossRoi, 'ROI');
        const netRoi = capResult.eligibleAmount;
        const cappedRoi = capResult.cappedAmount;

        let ledgerId = null;

        transaction(() => {
          // Insert into daily_roi_ledger
          const res = run(`
            INSERT INTO daily_roi_ledger (
              investment_id, user_id, roi_date, base_amount, roi_pct,
              gross_amount, net_amount, capped_amount, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PROCESSED')
          `, [inv.id, inv.user_id, today, baseAmount, roiPct, grossRoi, netRoi, cappedRoi]);

          ledgerId = res.lastInsertRowid;

          // Credit ROI wallet if netRoi > 0
          if (netRoi > 0) {
            WalletService.credit({
              userId: inv.user_id,
              walletType: 'ROI',
              transactionType: 'ROI',
              amount: netRoi,
              referenceId: `INV-${inv.id}-DATE-${today}`,
              description: `Daily 2% ROI for package ${inv.package_name} ($${baseAmount.toFixed(2)})`
            });
          }
        });

        // Trigger downstream 20-level ROI-on-ROI for uplines if net ROI was generated
        if (netRoi > 0 && ledgerId) {
          LevelCommissionService.processLevelIncome({
            roiLedgerId: ledgerId,
            downlineUserId: inv.user_id,
            downlineRoiAmount: netRoi
          });
        }

        processedCount++;
        totalGrossRoi += grossRoi;
        totalNetRoi += netRoi;
        totalCappedRoi += cappedRoi;

        recipients.push({
          userId: inv.user_id,
          userCode: inv.user_code,
          username: inv.username,
          packageCode: inv.package_code,
          packageName: inv.package_name,
          amount: baseAmount,
          netRoi: netRoi,
          grossRoi: grossRoi,
          cappedRoi: cappedRoi
        });
      } catch (err) {
        console.error(`[RoiService] Error processing ROI for investment ${inv.id}:`, err);
        errors.push({ investmentId: inv.id, error: err.message });
      }
    }

    // Log cron execution
    run(`
      INSERT INTO cron_execution_logs (cron_name, execution_date, processed_count, total_payout, status, details)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [
      'DAILY_ROI',
      today,
      processedCount,
      Number(totalNetRoi.toFixed(2)),
      errors.length === 0 ? 'SUCCESS' : 'PARTIAL_ERROR',
      JSON.stringify({ skippedCount, totalGrossRoi, totalNetRoi, totalCappedRoi, errorCount: errors.length })
    ]);

    return {
      date: today,
      processedCount,
      skippedCount,
      totalGrossRoi: Number(totalGrossRoi.toFixed(4)),
      totalNetRoi: Number(totalNetRoi.toFixed(4)),
      totalCappedRoi: Number(totalCappedRoi.toFixed(4)),
      recipients,
      errors
    };
  }
}

module.exports = RoiService;
