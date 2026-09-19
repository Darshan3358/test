const { db, query, get, run, transaction } = require('../database/db');
const WalletService = require('./WalletService');
const IncomeCapService = require('./IncomeCapService');
const LevelUnlockService = require('./LevelUnlockService');

class LevelCommissionService {
  /**
   * Commission percentage per level (1 to 20)
   */
  static getRates() {
    return {
      1: 10.0,
      2: 5.0,
      3: 5.0,
      4: 4.0,
      5: 4.0,
      6: 3.0,
      7: 3.0,
      8: 2.0,
      9: 2.0,
      10: 1.0,
      11: 1.0,
      12: 1.0,
      13: 1.0,
      14: 1.0,
      15: 1.0,
      16: 1.0,
      17: 1.0,
      18: 1.0,
      19: 1.0,
      20: 1.0
    };
  }

  /**
   * Calculate and distribute Level Income (ROI-on-ROI) up to 20 levels of uplines
   * when a downline user receives daily ROI.
   * 
   * @param {object} params
   * @param {number} params.roiLedgerId
   * @param {number} params.downlineUserId
   * @param {number} params.downlineRoiAmount
   * @returns {Array<object>} processed commission records
   */
  static processLevelIncome({ roiLedgerId, downlineUserId, downlineRoiAmount }) {
    if (downlineRoiAmount <= 0) return [];

    const rates = this.getRates();
    const results = [];

    // Traverse up to 20 levels of sponsors
    let currentUserId = downlineUserId;
    let level = 1;

    while (level <= 20) {
      // Find sponsor of current user
      const user = get('SELECT id, sponsor_id, status FROM users WHERE id = ?', [currentUserId]);
      if (!user || !user.sponsor_id) {
        break; // Reached root or no sponsor
      }

      const uplineId = user.sponsor_id;
      const upline = get('SELECT id, user_code, username, status FROM users WHERE id = ?', [uplineId]);

      if (!upline || upline.status !== 'ACTIVE') {
        currentUserId = uplineId;
        level++;
        continue;
      }

      const ratePct = rates[level] || 1.0;
      const grossCommission = Number(((downlineRoiAmount * ratePct) / 100).toFixed(4));

      // Check level unlock condition: 1 Direct = 1 Level Unlocked
      const isUnlocked = LevelUnlockService.isLevelUnlocked(uplineId, level);

      if (isUnlocked && grossCommission > 0) {
        // Pass through IncomeCapService
        const capResult = IncomeCapService.applyCap(uplineId, grossCommission, 'LEVEL');
        const netCommission = capResult.eligibleAmount;
        const cappedAmount = capResult.cappedAmount;

        // Prevent duplicate entry
        const existing = get(`
          SELECT id FROM level_commissions
          WHERE roi_ledger_id = ? AND upline_user_id = ? AND level = ?
        `, [roiLedgerId, uplineId, level]);

        if (!existing) {
          run(`
            INSERT INTO level_commissions (
              roi_ledger_id, downline_user_id, upline_user_id, level,
              commission_pct, downline_roi_amount, gross_amount, net_amount, capped_amount, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PROCESSED')
          `, [
            roiLedgerId, downlineUserId, uplineId, level,
            ratePct, downlineRoiAmount, grossCommission, netCommission, cappedAmount
          ]);

          if (netCommission > 0) {
            WalletService.credit({
              userId: uplineId,
              walletType: 'LEVEL',
              transactionType: 'LEVEL_COMMISSION',
              amount: netCommission,
              referenceId: `ROI-LEDGER-${roiLedgerId}-LVL-${level}`,
              description: `Level ${level} ROI-on-ROI Commission (${ratePct}%) from downline ROI of $${downlineRoiAmount.toFixed(2)}`
            });
          }

          results.push({
            uplineId,
            level,
            ratePct,
            grossCommission,
            netCommission,
            cappedAmount,
            isUnlocked: true
          });
        }
      } else {
        // Level locked or 0 commission
        results.push({
          uplineId,
          level,
          ratePct,
          grossCommission,
          netCommission: 0,
          cappedAmount: grossCommission,
          isUnlocked: false
        });
      }

      // Move to next upline
      currentUserId = uplineId;
      level++;
    }

    return results;
  }
}

module.exports = LevelCommissionService;
