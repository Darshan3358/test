const { getDb } = require('../database/mongo');
const LevelUnlockService = require('./LevelUnlockService');

class GenealogyService {
  /**
   * Get direct referrals for a user with investment status and direct business
   */
  static async getDirectReferrals(userId) {
    const db = getDb();
    const uid = Number(userId);

    const users = await db.collection('users').find({
      sponsor_id: uid,
      status: { $ne: 'DELETED' }
    }).sort({ id: -1, _id: -1 }).toArray();

    if (users.length === 0) return [];

    const userIds = users.map(u => u.id !== undefined ? u.id : u.sqlite_id).filter(Boolean);
    const activeInvs = await db.collection('investments').find({
      user_id: { $in: userIds },
      status: 'ACTIVE'
    }).toArray();

    const invMap = {};
    for (const inv of activeInvs) {
      const invUid = Number(inv.user_id);
      if (!invMap[invUid]) {
        invMap[invUid] = { total: 0, count: 0 };
      }
      invMap[invUid].total += Number(inv.amount || 0);
      invMap[invUid].count += 1;
    }

    return users.map(u => {
      const uId = u.id !== undefined ? u.id : u.sqlite_id;
      const stats = invMap[uId] || { total: 0, count: 0 };
      return {
        id: uId,
        user_code: u.user_code,
        username: u.username,
        full_name: u.full_name,
        email: u.email,
        mobile: u.mobile,
        user_type: u.user_type,
        status: u.status,
        created_at: u.created_at,
        total_invested: stats.total,
        investment_count: stats.count
      };
    });
  }

  /**
   * Traverse downline levels (up to 20 levels) and compile team metrics
   */
  static async getDownlineSummary(userId) {
    const db = getDb();
    const uid = Number(userId);
    const unlockStatus = await LevelUnlockService.getLevelStatus(uid);
    const unlockedLevelsCount = Array.isArray(unlockStatus) ? unlockStatus.filter(l => l.isUnlocked).length : 0;

    // Breadth-first traversal up to 20 levels
    let currentLevelUserIds = [uid];
    const levelStats = [];
    let totalTeam = 0;
    let activeTeam = 0;
    let totalTeamBusiness = 0;

    for (let level = 1; level <= 20; level++) {
      if (currentLevelUserIds.length === 0) break;

      const downlineUsers = await db.collection('users').find({
        sponsor_id: { $in: currentLevelUserIds },
        status: { $ne: 'DELETED' }
      }).toArray();

      if (downlineUsers.length === 0) break;

      const downlineIds = downlineUsers.map(u => u.id !== undefined ? u.id : u.sqlite_id).filter(Boolean);
      const activeInvs = await db.collection('investments').find({
        user_id: { $in: downlineIds },
        status: 'ACTIVE'
      }).toArray();

      const invMap = {};
      for (const inv of activeInvs) {
        const invUid = Number(inv.user_id);
        if (!invMap[invUid]) invMap[invUid] = { total: 0, count: 0 };
        invMap[invUid].total += Number(inv.amount || 0);
        invMap[invUid].count += 1;
      }

      let levelActiveCount = 0;
      let levelBusiness = 0;
      const nextLevelIds = [];
      const formattedMembers = [];

      for (const u of downlineUsers) {
        const uId = u.id !== undefined ? u.id : u.sqlite_id;
        nextLevelIds.push(uId);
        const stats = invMap[uId] || { total: 0, count: 0 };
        levelBusiness += stats.total;
        if (u.status === 'ACTIVE' && stats.count > 0) {
          levelActiveCount++;
        }
        formattedMembers.push({
          id: uId,
          user_code: u.user_code,
          username: u.username,
          full_name: u.full_name,
          status: u.status,
          user_type: u.user_type,
          sponsor_id: u.sponsor_id,
          created_at: u.created_at,
          total_invested: stats.total,
          active_investments: stats.count
        });
      }

      totalTeam += downlineUsers.length;
      activeTeam += levelActiveCount;
      totalTeamBusiness += levelBusiness;

      levelStats.push({
        level,
        count: downlineUsers.length,
        activeCount: levelActiveCount,
        business: Number(levelBusiness.toFixed(2)),
        isUnlocked: level <= unlockedLevelsCount,
        members: formattedMembers.slice(0, 10)
      });

      currentLevelUserIds = nextLevelIds;
    }

    // Direct stats
    const directs = await this.getDirectReferrals(uid);
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
  static async getVisualTree(userId, maxDepth = 3) {
    const db = getDb();
    const uid = Number(userId);

    const root = await db.collection('users').findOne({
      $or: [{ id: uid }, { sqlite_id: uid }]
    });
    if (!root) return null;

    const rootId = root.id !== undefined ? root.id : root.sqlite_id;
    const rootInvs = await db.collection('investments').find({
      user_id: rootId,
      status: 'ACTIVE'
    }).toArray();
    const rootInvested = rootInvs.reduce((s, i) => s + Number(i.amount || 0), 0);

    async function buildBranch(user, currentDepth) {
      const uId = user.id !== undefined ? user.id : user.sqlite_id;
      const node = {
        id: uId,
        user_code: user.user_code,
        username: user.username,
        full_name: user.full_name,
        user_type: user.user_type,
        status: user.status,
        invested: Number(user.total_invested || 0),
        children: []
      };

      if (currentDepth >= maxDepth) return node;

      const children = await db.collection('users').find({
        $or: [{ sponsor_id: uId }, { sponsor_id: String(uId) }, { sponsor_id: Number(uId) }],
        status: { $ne: 'DELETED' }
      }).sort({ id: 1 }).toArray();

      if (children.length === 0) return node;

      const childIds = children.map(c => c.id !== undefined ? c.id : c.sqlite_id);
      const childInvs = await db.collection('investments').find({
        user_id: { $in: childIds },
        status: 'ACTIVE'
      }).toArray();

      const invMap = {};
      for (const inv of childInvs) {
        invMap[inv.user_id] = (invMap[inv.user_id] || 0) + Number(inv.amount || 0);
      }

      for (const child of children) {
        const cId = child.id !== undefined ? child.id : child.sqlite_id;
        child.total_invested = invMap[cId] || 0;
        node.children.push(await buildBranch(child, currentDepth + 1));
      }

      return node;
    }

    root.total_invested = rootInvested;
    return await buildBranch(root, 1);
  }
}

module.exports = GenealogyService;
