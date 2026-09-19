const { db, query, get, run } = require('../database/db');

class LevelUnlockService {
  /**
   * Recalculate level unlock status for a user based on active direct referrals.
   * Rule: 1 Direct Referral = 1 Level Unlock (up to max 20 levels).
   * 
   * @param {number} userId
   * @returns {{ directCount: number, unlockedLevels: number }}
   */
  static recalculate(userId) {
    // Count active direct referrals who have at least one active investment
    // Or users who have registered and purchased a package
    const row = get(`
      SELECT COUNT(DISTINCT u.id) as direct_count
      FROM users u
      INNER JOIN investments inv ON inv.user_id = u.id
      WHERE u.sponsor_id = ? AND u.status = 'ACTIVE'
    `, [userId]);

    const directCount = row ? Number(row.direct_count) : 0;
    const unlockedLevels = Math.min(20, directCount);

    run(`
      INSERT INTO level_unlocks (user_id, direct_count, unlocked_levels, updated_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(user_id) DO UPDATE SET
        direct_count = excluded.direct_count,
        unlocked_levels = excluded.unlocked_levels,
        updated_at = CURRENT_TIMESTAMP
    `, [userId, directCount, unlockedLevels]);

    return { directCount, unlockedLevels };
  }

  /**
   * Check if a specific level is unlocked for a user
   * 
   * @param {number} userId
   * @param {number} levelNumber (1 to 20)
   * @returns {boolean}
   */
  static isLevelUnlocked(userId, levelNumber) {
    let unlock = get('SELECT unlocked_levels FROM level_unlocks WHERE user_id = ?', [userId]);
    if (!unlock) {
      const rec = this.recalculate(userId);
      return rec.unlockedLevels >= levelNumber;
    }
    return Number(unlock.unlocked_levels) >= levelNumber;
  }

  /**
   * Get all level unlock details for user dashboard display
   * 
   * @param {number} userId
   * @returns {Array<{ level: number, requiredDirects: number, currentDirects: number, isUnlocked: boolean }>}
   */
  static getLevelStatus(userId) {
    let unlock = get('SELECT direct_count, unlocked_levels FROM level_unlocks WHERE user_id = ?', [userId]);
    if (!unlock) {
      this.recalculate(userId);
      unlock = get('SELECT direct_count, unlocked_levels FROM level_unlocks WHERE user_id = ?', [userId]);
    }

    const currentDirects = unlock ? Number(unlock.direct_count) : 0;
    const unlockedLevels = unlock ? Number(unlock.unlocked_levels) : 0;

    const levels = [];
    const commissionRates = {
      1: 10, 2: 5, 3: 5, 4: 4, 5: 4,
      6: 3, 7: 3, 8: 2, 9: 2,
      10: 1, 11: 1, 12: 1, 13: 1, 14: 1,
      15: 1, 16: 1, 17: 1, 18: 1, 19: 1, 20: 1
    };

    for (let l = 1; l <= 20; l++) {
      levels.push({
        level: l,
        requiredDirects: l,
        currentDirects,
        commissionPct: commissionRates[l] || 1.0,
        isUnlocked: unlockedLevels >= l
      });
    }

    return levels;
  }
}

module.exports = LevelUnlockService;
