const { getDb } = require('../database/mongo');

class LevelUnlockService {
  /**
   * Recalculate level unlock status for a user based on active direct referrals.
   * Rule: 1 Direct Referral = 1 Level Unlock (up to max 20 levels).
   * 
   * @param {number} userId
   * @returns {Promise<{ directCount: number, unlockedLevels: number }>}
   */
  static async recalculate(userId) {
    const db = getDb();
    const uid = Number(userId);

    // Find active direct referrals
    const directs = await db.collection('users').find({
      sponsor_id: uid,
      status: 'ACTIVE'
    }).toArray();

    const directIds = directs.map(d => d.id !== undefined ? d.id : d.sqlite_id).filter(Boolean);
    let directCount = 0;

    if (directIds.length > 0) {
      const activeInvs = await db.collection('investments').find({
        user_id: { $in: directIds },
        status: 'ACTIVE'
      }).toArray();
      const uniqueInvestors = new Set(activeInvs.map(i => i.user_id));
      directCount = uniqueInvestors.size;
    }

    const unlockedLevels = Math.min(20, directCount);

    await db.collection('level_unlocks').updateOne(
      { user_id: uid },
      {
        $set: {
          user_id: uid,
          direct_count: directCount,
          unlocked_levels: unlockedLevels,
          updated_at: new Date()
        }
      },
      { upsert: true }
    );

    return { directCount, unlockedLevels };
  }

  /**
   * Check if a specific level is unlocked for a user
   * 
   * @param {number} userId
   * @param {number} levelNumber (1 to 20)
   * @returns {Promise<boolean>}
   */
  static async isLevelUnlocked(userId, levelNumber) {
    const db = getDb();
    const uid = Number(userId);
    let unlock = await db.collection('level_unlocks').findOne({ user_id: uid });
    if (!unlock) {
      const rec = await this.recalculate(userId);
      return rec.unlockedLevels >= levelNumber;
    }
    return Number(unlock.unlocked_levels) >= levelNumber;
  }

  /**
   * Get all level unlock details for user dashboard display
   * 
   * @param {number} userId
   * @returns {Promise<Array<{ level: number, requiredDirects: number, currentDirects: number, isUnlocked: boolean }>>}
   */
  static async getLevelStatus(userId) {
    const db = getDb();
    const uid = Number(userId);
    let unlock = await db.collection('level_unlocks').findOne({ user_id: uid });
    if (!unlock) {
      await this.recalculate(userId);
      unlock = await db.collection('level_unlocks').findOne({ user_id: uid });
    }

    const currentDirects = unlock ? Number(unlock.direct_count || 0) : 0;
    const unlockedLevels = unlock ? Number(unlock.unlocked_levels || 0) : 0;

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
