const { db, query, get } = require('../database/db');
const LevelUnlockService = require('./LevelUnlockService');

class GenealogyService {
  /**
   * Get direct referrals for a user with investment status and direct business
   */
  static getDirectReferrals(userId) {
    return query(`
      SELECT 
        u.id, u.user_code, u.username, u.full_name, u.email, u.mobile,
        u.user_type, u.status, u.created_at,
        COALESCE(SUM(inv.amount), 0) as total_invested,
        COUNT(inv.id) as investment_count
      FROM users u
      LEFT JOIN investments inv ON inv.user_id = u.id AND inv.status = 'ACTIVE'
      WHERE u.sponsor_id = ?
      GROUP BY u.id
      ORDER BY u.id DESC
    `, [userId]);
  }

  /**
   * Traverse downline levels (up to 20 levels) and compile team metrics
   */
  static getDownlineSummary(userId) {
    const unlockStatus = LevelUnlockService.getLevelStatus(userId);
    const unlockedLevelsCount = unlockStatus.filter(l => l.isUnlocked).length;

    // Breadth-first traversal up to 20 levels
    let currentLevelUserIds = [userId];
    const levelStats = [];
    let totalTeam = 0;
    let activeTeam = 0;
    let totalTeamBusiness = 0;

    for (let level = 1; level <= 20; level++) {
      if (currentLevelUserIds.length === 0) break;

      const placeholders = currentLevelUserIds.map(() => '?').join(',');
      const downlineMembers = query(`
        SELECT 
          u.id, u.user_code, u.username, u.full_name, u.status, u.user_type,
          u.sponsor_id, u.created_at,
          COALESCE(SUM(inv.amount), 0) as total_invested,
          COUNT(inv.id) as active_investments
        FROM users u
        LEFT JOIN investments inv ON inv.user_id = u.id AND inv.status = 'ACTIVE'
        WHERE u.sponsor_id IN (${placeholders})
        GROUP BY u.id
      `, currentLevelUserIds);

      if (downlineMembers.length === 0) break;

      let levelActiveCount = 0;
      let levelBusiness = 0;
      const nextLevelIds = [];

      for (const m of downlineMembers) {
        nextLevelIds.push(m.id);
        const invested = Number(m.total_invested || 0);
        levelBusiness += invested;
        if (m.status === 'ACTIVE' && Number(m.active_investments) > 0) {
          levelActiveCount++;
        }
      }

      totalTeam += downlineMembers.length;
      activeTeam += levelActiveCount;
      totalTeamBusiness += levelBusiness;

      levelStats.push({
        level,
        count: downlineMembers.length,
        activeCount: levelActiveCount,
        business: Number(levelBusiness.toFixed(2)),
        isUnlocked: level <= unlockedLevelsCount,
        members: downlineMembers.slice(0, 10) // preview first 10
      });

      currentLevelUserIds = nextLevelIds;
    }

    // Direct stats
    const directs = this.getDirectReferrals(userId);
    const activeDirects = directs.filter(d => Number(d.total_invested) > 0 && d.status === 'ACTIVE').length;
    const directBusiness = directs.reduce((sum, d) => sum + Number(d.total_invested || 0), 0);

    return {
      totalDirects: directs.length,
      activeDirects,
      directBusiness: Number(directBusiness.toFixed(2)),
      totalTeam,
      activeTeam,
      inactiveTeam: totalTeam - activeTeam,
      totalTeamBusiness: Number(totalTeamBusiness.toFixed(2)),
      unlockedLevels: unlockedLevelsCount,
      levelStats
    };
  }

  /**
   * Get tree data formatted for visual interactive tree rendering (depth limited)
   */
  static getVisualTree(userId, maxDepth = 3) {
    const rootUser = get(`
      SELECT 
        u.id, u.user_code, u.username, u.full_name, u.user_type, u.status,
        COALESCE(SUM(inv.amount), 0) as total_invested
      FROM users u
      LEFT JOIN investments inv ON inv.user_id = u.id AND inv.status = 'ACTIVE'
      WHERE u.id = ?
      GROUP BY u.id
    `, [userId]);

    if (!rootUser) return null;

    function buildBranch(user, currentDepth) {
      const node = {
        id: user.id,
        user_code: user.user_code,
        username: user.username,
        full_name: user.full_name,
        user_type: user.user_type,
        status: user.status,
        invested: Number(user.total_invested || 0),
        children: []
      };

      if (currentDepth >= maxDepth) return node;

      const children = query(`
        SELECT 
          u.id, u.user_code, u.username, u.full_name, u.user_type, u.status,
          COALESCE(SUM(inv.amount), 0) as total_invested
        FROM users u
        LEFT JOIN investments inv ON inv.user_id = u.id AND inv.status = 'ACTIVE'
        WHERE u.sponsor_id = ?
        GROUP BY u.id
        ORDER BY u.id ASC
      `, [user.id]);

      for (const child of children) {
        node.children.push(buildBranch(child, currentDepth + 1));
      }

      return node;
    }

    return buildBranch(rootUser, 1);
  }
}

module.exports = GenealogyService;
