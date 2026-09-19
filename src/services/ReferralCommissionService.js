const { db, query, get, run, transaction } = require('../database/db');
const WalletService = require('./WalletService');
const IncomeCapService = require('./IncomeCapService');
const LevelUnlockService = require('./LevelUnlockService');

// Default One-Time Referral Rates across 5 levels:
// Level 1 → 5%
// Level 2 → 2%
// Level 3 → 1%
// Level 4 → 1%
// Level 5 → 1%
const DEFAULT_REFERRAL_RATES = {
  1: 5.0,
  2: 2.0,
  3: 1.0,
  4: 1.0,
  5: 1.0
};

const MAX_REFERRAL_DEPTH = 5;

class ReferralCommissionService {
  /**
   * Helper to retrieve configured referral rate for a given generation level (1 to 5)
   * @param {number} level 
   * @returns {number} percentage
   */
  static getRateForLevel(level) {
    const key = `referral_level_${level}_pct`;
    const setting = get('SELECT value FROM mlm_settings WHERE key = ?', [key]);
    if (setting && setting.value !== null && setting.value !== undefined) {
      const val = parseFloat(setting.value);
      if (!isNaN(val)) return val;
    }
    return DEFAULT_REFERRAL_RATES[level] || 0.0;
  }

  /**
   * Process one-time multi-level referral commission (Levels 1 to 5)
   * upon a qualifying package purchase.
   * 
   * Level 1 → 5%
   * Level 2 → 2%
   * Level 3 → 1%
   * Level 4 → 1%
   * Level 5 → 1%
   * Maximum referral depth = 5 levels.
   * 
   * @param {object} params
   * @param {number} params.investmentId
   * @param {number} params.buyerUserId
   * @param {number} params.packageAmount
   * @returns {object} summary of processed referral commissions
   */
  static processReferralCommission({ investmentId, buyerUserId, packageAmount }) {
    if (packageAmount <= 0) return { totalCommissions: 0, results: [] };

    // Get buyer details
    const buyer = get('SELECT id, user_code, username, sponsor_id FROM users WHERE id = ?', [buyerUserId]);
    if (!buyer || !buyer.sponsor_id) {
      console.log(`[ReferralCommission] Buyer ${buyerUserId} has no sponsor. Skipping referral commissions.`);
      return { totalCommissions: 0, results: [] };
    }

    return transaction(() => {
      const results = [];
      let currentUplineId = buyer.sponsor_id;

      for (let level = 1; level <= MAX_REFERRAL_DEPTH && currentUplineId; level++) {
        const upline = get('SELECT id, user_code, username, status, user_type, sponsor_id FROM users WHERE id = ?', [currentUplineId]);
        if (!upline) break;

        // Only active uplines receive referral commission
        if (upline.status === 'ACTIVE') {
          // Check if referral commission already generated for this investment & upline
          const existing = get(
            'SELECT id FROM referral_commissions WHERE investment_id = ? AND upline_user_id = ?',
            [investmentId, upline.id]
          );

          if (!existing) {
            const ratePct = ReferralCommissionService.getRateForLevel(level);

            if (ratePct > 0) {
              const grossAmount = Number(((packageAmount * ratePct) / 100).toFixed(4));

              // Evaluate against Income Cap for this upline
              const capResult = IncomeCapService.applyCap(upline.id, grossAmount, 'REFERRAL');
              const netAmount = capResult.eligibleAmount;
              const cappedAmount = capResult.cappedAmount;

              // Record in referral_commissions table
              run(`
                INSERT INTO referral_commissions (
                  investment_id, buyer_user_id, upline_user_id, level,
                  commission_pct, package_amount, gross_amount, net_amount, capped_amount, status
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PROCESSED')
              `, [
                investmentId, buyerUserId, upline.id, level,
                ratePct, packageAmount, grossAmount, netAmount, cappedAmount
              ]);

              // Credit upline's REFERRAL (Commission) wallet
              if (netAmount > 0) {
                WalletService.credit({
                  userId: upline.id,
                  walletType: 'REFERRAL',
                  transactionType: 'REFERRAL_COMMISSION',
                  amount: netAmount,
                  referenceId: `INV-${investmentId}-BUYER-${buyerUserId}-LVL-${level}`,
                  description: `Level ${level} Referral Commission (${ratePct}%) from ${buyer.username}'s package purchase of $${packageAmount.toFixed(2)}`
                });
              }

              results.push({
                uplineId: upline.id,
                username: upline.username,
                level,
                ratePct,
                packageAmount,
                grossAmount,
                netAmount,
                cappedAmount
              });
            }
          }
        }

        // Direct sponsor level unlock update (1 Direct = 1 Level Unlock for ROI residuals)
        if (level === 1) {
          LevelUnlockService.recalculate(upline.id);
        }

        // Move to the next upline in the hierarchy
        currentUplineId = upline.sponsor_id;
      }

      return {
        totalCommissions: results.length,
        results
      };
    });
  }
}

module.exports = ReferralCommissionService;
