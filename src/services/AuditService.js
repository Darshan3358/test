const { db, query, get, run } = require('../database/db');

class AuditService {
  /**
   * Log an administrative or security sensitive action
   */
  static log({
    actorId = null,
    actorName = 'System',
    actorRole = 'SYSTEM',
    action,
    targetType = null,
    targetId = null,
    details = null,
    ipAddress = '127.0.0.1'
  }) {
    const detailsStr = typeof details === 'object' && details !== null ? JSON.stringify(details) : details;

    run(`
      INSERT INTO audit_logs (
        actor_id, actor_name, actor_role, action,
        target_type, target_id, details, ip_address
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      actorId,
      actorName,
      actorRole,
      action,
      targetType,
      targetId ? String(targetId) : null,
      detailsStr,
      ipAddress
    ]);
  }

  /**
   * Get recent audit logs
   */
  static getLogs({ limit = 50, offset = 0, action = null } = {}) {
    let sql = 'SELECT * FROM audit_logs';
    const params = [];

    if (action) {
      sql += ' WHERE action = ?';
      params.push(action);
    }

    sql += ' ORDER BY id DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    return query(sql, params);
  }
}

module.exports = AuditService;
