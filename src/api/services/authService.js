const jwt = require('jsonwebtoken');
const config = require('../../config');
const { getDb } = require('../../database/db');
const { logAudit } = require('../../utils/audit');

function issueToken(partner) {
  return jwt.sign(
    { partner_id: partner.id, telegram_id: partner.telegram_id },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn }
  );
}

function register({ telegram_id, name, phone, greenway_id, consent_data_processing, consent_notifications }) {
  if (!consent_data_processing) {
    throw new Error('consent_data_processing is required (ФЗ-152)');
  }
  const db = getDb();
  const now = new Date().toISOString();
  const existing = db.prepare('SELECT * FROM partners WHERE telegram_id = ?').get(telegram_id);
  if (existing) {
    return { partner: existing, token: issueToken(existing) };
  }
  const info = db
    .prepare(
      `INSERT INTO partners (telegram_id, name, phone, greenway_id, consent_data_processing_at, consent_notifications_at, last_login)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      telegram_id,
      name,
      phone,
      greenway_id || null,
      now,
      consent_notifications ? now : null,
      now
    );
  const partner = db.prepare('SELECT * FROM partners WHERE id = ?').get(info.lastInsertRowid);
  logAudit({ userId: partner.id, userType: 'partner', action: 'register', entity: 'partners', entityId: partner.id });
  return { partner, token: issueToken(partner) };
}

function login({ telegram_id }) {
  const db = getDb();
  const partner = db.prepare('SELECT * FROM partners WHERE telegram_id = ?').get(telegram_id);
  if (!partner) {
    throw new Error('Partner not found');
  }
  db.prepare('UPDATE partners SET last_login = CURRENT_TIMESTAMP WHERE id = ?').run(partner.id);
  logAudit({ userId: partner.id, userType: 'partner', action: 'login', entity: 'partners', entityId: partner.id });
  return { token: issueToken(partner) };
}

function verifyToken(token) {
  return jwt.verify(token, config.jwtSecret);
}

module.exports = { register, login, verifyToken, issueToken };
