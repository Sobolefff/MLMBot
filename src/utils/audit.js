const { getDb } = require('../database/db');

function logAudit({ userId, userType, action, entity, entityId, details }) {
  const db = getDb();
  db.prepare(
    `INSERT INTO audit_logs (user_id, user_type, action, entity, entity_id, details)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(userId ?? null, userType ?? null, action, entity ?? null, entityId ?? null, details ? JSON.stringify(details) : null);
}

module.exports = { logAudit };
