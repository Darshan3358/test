const { db, query, get, run } = require('../database/db');

class IncomeCapService {
  /**
   * Fetch current MLM settings for multipliers and cap scope
   */
  static getCapSettings() {
    const rows = query("SELECT key, value FROM mlm_settings WHERE key IN ('working_multiplier', 'investor_multiplier', 'income_cap_scope')");
    const settings = {
      working_multiplier: 3.0,
      investor_multiplier: 2.0,
      income_cap_scope: 'ALL'
    };

    for (const r of rows) {
      if (r.key === 'working_multiplier') settings.working_multiplier = parseFloat(r.value) || 3.0;
      if (r.key === 'investor_multiplier') settings.investor_multiplier = parseFloat(r.value) || 2.0;
      if (r.key === 'income_cap_scope') settings.income_cap_scope = r.value;
    }

    return settings;
  }

  /**
   * Get the multiplier for a user according to their user type
   */
  static getUserMultiplier(userType) {
    const settings = this.getCapSettings();
    if (userType === 'WORKING') {
      return settings.working_multiplier; // 3.0
    }
    return settings.investor_multiplier; // 2.0 (INVESTOR, ACTIVE)
  }

  /**
   * Evaluate income cap for a user when earning a prospective commission/ROI.
   * If user has active investment(s), calculate remaining room on active package(s).
   * 
   * @param {number} userId
   * @param {number} proposedAmount
   * @param {string} incomeType - 'ROI', 'REFERRAL', 'LEVEL', 'SALARY'
   * @returns {{ eligibleAmount: number, cappedAmount: number, isCapped: boolean, investmentId: number|null }}
   */
  static applyCap(userId, proposedAmount, incomeType = 'ROI') {
    if (proposedAmount <= 0) {
      return { eligibleAmount: 0, cappedAmount: 0, isCapped: false, investmentId: null };
    }

    // Check if user is Admin - Admins have no income cap
    const user = get('SELECT id, role, user_type FROM users WHERE id = ?', [userId]);
    if (user && user.role === 'ADMIN') {
      return {
        eligibleAmount: Number(proposedAmount.toFixed(4)),
        cappedAmount: 0,
        isCapped: false,
        investmentId: null
      };
    }

    const settings = this.getCapSettings();

    // Check if this income type is included in cap
    if (settings.income_cap_scope === 'ROI_ONLY' && incomeType !== 'ROI') {
      return {
        eligibleAmount: Number(proposedAmount.toFixed(4)),
        cappedAmount: 0,
        isCapped: false,
        investmentId: null
      };
    }

    // Find the active investment for this user with remaining capacity
    // Sort by oldest active first (FIFO)
    const activeInvestments = query(`
      SELECT * FROM investments
      WHERE user_id = ? AND status = 'ACTIVE'
      ORDER BY id ASC
    `, [userId]);

    if (!activeInvestments || activeInvestments.length === 0) {
      // User has no active investment. If strict, they cannot earn package-linked income.
      // We log the whole amount as capped/rejected.
      return {
        eligibleAmount: 0,
        cappedAmount: Number(proposedAmount.toFixed(4)),
        isCapped: true,
        investmentId: null,
        reason: 'No active investment found'
      };
    }

    let remainingToCredit = proposedAmount;
    let totalEligible = 0;
    let totalCapped = 0;
    let primaryInvestmentId = activeInvestments[0].id;

    for (const inv of activeInvestments) {
      if (remainingToCredit <= 0) break;

      const currentTotal = Number(inv.total_income_earned || 0);
      const maxCap = Number(inv.max_income_cap);
      const remainingRoom = Math.max(0, maxCap - currentTotal);

      if (remainingRoom <= 0) {
        // Mark as CAPPED if not already
        run("UPDATE investments SET status = 'CAPPED', capped_at = CURRENT_TIMESTAMP WHERE id = ?", [inv.id]);
        continue;
      }

      if (remainingToCredit <= remainingRoom) {
        // Entire remainingToCredit fits in this investment
        const creditPart = remainingToCredit;
        totalEligible += creditPart;
        const newTotal = Number((currentTotal + creditPart).toFixed(4));
        const newRoiTotal = incomeType === 'ROI' ? Number(((inv.total_roi_earned || 0) + creditPart).toFixed(4)) : inv.total_roi_earned;

        const isNowCapped = newTotal >= maxCap;
        run(`
          UPDATE investments
          SET total_income_earned = ?,
              total_roi_earned = ?,
              status = ?,
              capped_at = ?
          WHERE id = ?
        `, [
          newTotal,
          newRoiTotal,
          isNowCapped ? 'CAPPED' : 'ACTIVE',
          isNowCapped ? new Date().toISOString() : null,
          inv.id
        ]);

        remainingToCredit = 0;
      } else {
        // Partially fills this investment
        const creditPart = remainingRoom;
        totalEligible += creditPart;
        remainingToCredit -= creditPart;

        const newRoiTotal = incomeType === 'ROI' ? Number(((inv.total_roi_earned || 0) + creditPart).toFixed(4)) : inv.total_roi_earned;

        run(`
          UPDATE investments
          SET total_income_earned = ?,
              total_roi_earned = ?,
              status = 'CAPPED',
              capped_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `, [maxCap, newRoiTotal, inv.id]);
      }
    }

    if (remainingToCredit > 0) {
      totalCapped = Number(remainingToCredit.toFixed(4));
    }

    return {
      eligibleAmount: Number(totalEligible.toFixed(4)),
      cappedAmount: totalCapped,
      isCapped: totalCapped > 0,
      investmentId: primaryInvestmentId
    };
  }
}

module.exports = IncomeCapService;
