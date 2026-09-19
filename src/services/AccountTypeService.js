const { query, get, run, transaction } = require('../database/db');

class AccountTypeService {
  /**
   * Determine the dynamic account type for a user based on the platform rules:
   * 
   * 1. SUSPENDED: If account status is SUSPENDED by admin.
   * 2. WORKING: If user has directly referred at least one member who has invested
   *    (whether the user themselves invested or not).
   * 3. INVESTOR: If user has personally invested in a package but has not referred an active investor.
   * 4. ACTIVE: If user registered and logged in, but has not invested and has no active paying referrals.
   * 
   * @param {number|object} userOrId
   * @returns {string} 'ACTIVE' | 'INVESTOR' | 'WORKING' | 'SUSPENDED'
   */
  static evaluateAccountType(userOrId) {
    let user;
    if (typeof userOrId === 'object' && userOrId !== null) {
      user = userOrId;
    } else {
      user = get('SELECT id, role, status, user_type FROM users WHERE id = ?', [userOrId]);
    }

    if (!user) return 'ACTIVE';

    // 1. If account is suspended by administrator
    if (user.status === 'SUSPENDED') {
      return 'SUSPENDED';
    }

    // Administrator always possesses full working access
    if (user.role === 'ADMIN') {
      return 'WORKING';
    }

    // 2. Check if user has referred any member who has activated an investment package
    // (Working category: unlocked by having at least 1 active paying direct referral)
    const activeReferrals = get(`
      SELECT COUNT(DISTINCT u.id) as count
      FROM users u
      JOIN investments inv ON inv.user_id = u.id AND inv.status = 'ACTIVE'
      WHERE u.sponsor_id = ?
    `, [user.id]);

    if (activeReferrals && activeReferrals.count > 0) {
      return 'WORKING';
    }

    // 3. Check if user has personally invested any amount
    const personalInvestments = get(`
      SELECT COUNT(*) as count
      FROM investments
      WHERE user_id = ? AND status = 'ACTIVE'
    `, [user.id]);

    if (personalInvestments && personalInvestments.count > 0) {
      return 'INVESTOR';
    }

    // 4. Default state: registered user without active investments or paying referrals
    return 'ACTIVE';
  }

  /**
   * Sync a user's account type in the database and upgrade investment multipliers if transitioning to WORKING
   * @param {number} userId
   * @returns {string} evaluated type
   */
  static syncUserType(userId) {
    if (!userId) return 'ACTIVE';
    const newType = this.evaluateAccountType(userId);

    run('UPDATE users SET user_type = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [newType, userId]);

    // If upgraded to WORKING, upgrade active investment contracts to 3X multiplier
    if (newType === 'WORKING') {
      const workingMult = 3.0;
      run(`
        UPDATE investments
        SET multiplier = ?, max_income_cap = amount * ?
        WHERE user_id = ? AND status = 'ACTIVE' AND multiplier < ?
      `, [workingMult, workingMult, userId, workingMult]);
    }

    return newType;
  }

  /**
   * Sync all users across the system
   */
  static syncAllUserTypes() {
    const users = query('SELECT id, role, status, user_type FROM users');
    transaction(() => {
      for (const u of users) {
        const newType = this.evaluateAccountType(u);
        if (u.user_type !== newType) {
          run('UPDATE users SET user_type = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [newType, u.id]);
          if (newType === 'WORKING') {
            run(`
              UPDATE investments
              SET multiplier = 3.0, max_income_cap = amount * 3.0
              WHERE user_id = ? AND status = 'ACTIVE' AND multiplier < 3.0
            `, [u.id]);
          }
        }
      }
    });
  }

  /**
   * Suspend a user account
   * @param {number} userId
   */
  static suspendUser(userId) {
    run("UPDATE users SET status = 'SUSPENDED', user_type = 'SUSPENDED', updated_at = CURRENT_TIMESTAMP WHERE id = ?", [userId]);
  }

  /**
   * Unsuspend a user account and restore dynamic type
   * @param {number} userId
   * @returns {string} restored type
   */
  static unsuspendUser(userId) {
    run("UPDATE users SET status = 'ACTIVE', user_type = 'ACTIVE', updated_at = CURRENT_TIMESTAMP WHERE id = ?", [userId]);
    return this.syncUserType(userId);
  }
}

module.exports = AccountTypeService;
