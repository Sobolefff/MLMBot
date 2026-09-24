const express = require('express');
const rateLimit = require('express-rate-limit');
const Joi = require('joi');
const { getDb } = require('../../database/db');
const { requireAuth } = require('../middleware/auth');
const { logAudit } = require('../../utils/audit');

const router = express.Router();

// Throttle sensitive write endpoints (settings changes, full account
// erasure) to reduce abuse/DoS risk beyond normal usage patterns.
const sensitiveWriteLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Слишком много запросов. Повторите позже.' },
});

router.get('/me', requireAuth, (req, res) => {
  const db = getDb();
  const partner = db.prepare('SELECT * FROM partners WHERE id = ?').get(req.auth.partner_id);
  if (!partner) return res.status(404).json({ error: 'Partner not found' });
  res.json(partner);
});

function ensureOwnPartner(req, res, next) {
  if (Number(req.params.id) !== req.auth.partner_id) {
    logAudit({
      userId: req.auth.partner_id,
      userType: 'partner',
      action: 'unauthorized_access_attempt',
      entity: 'partners',
      entityId: req.params.id,
    });
    return res.status(403).json({ error: 'Forbidden' });
  }
  next();
}

router.get('/:id/clients', requireAuth, ensureOwnPartner, (req, res) => {
  const db = getDb();
  const clients = db.prepare('SELECT * FROM clients WHERE partner_id = ? ORDER BY last_order_date DESC').all(req.params.id);
  res.json(clients);
});

const createClientSchema = Joi.object({
  name: Joi.string().min(1).max(200).required(),
  phone: Joi.string().min(5).max(30).allow(null, ''),
});

router.post('/:id/clients', requireAuth, ensureOwnPartner, (req, res) => {
  const { error, value } = createClientSchema.validate(req.body);
  if (error) return res.status(400).json({ error: error.message });
  const db = getDb();
  try {
    const info = db
      .prepare('INSERT INTO clients (partner_id, name, phone) VALUES (?, ?, ?)')
      .run(req.params.id, value.name, value.phone || null);
    const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(info.lastInsertRowid);
    logAudit({ userId: req.auth.partner_id, userType: 'partner', action: 'create_client', entity: 'clients', entityId: client.id });
    res.status(201).json(client);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/:id/clients/:clientId', requireAuth, ensureOwnPartner, (req, res) => {
  const db = getDb();
  const client = db.prepare('SELECT * FROM clients WHERE id = ? AND partner_id = ?').get(req.params.clientId, req.params.id);
  if (!client) return res.status(404).json({ error: 'Client not found' });
  db.prepare('DELETE FROM chains WHERE client_id = ?').run(client.id);
  db.prepare('DELETE FROM clients WHERE id = ?').run(client.id);
  logAudit({ userId: req.auth.partner_id, userType: 'partner', action: 'delete_client', entity: 'clients', entityId: client.id });
  res.json({ ok: true });
});

const settingsSchema = Joi.object({
  notifications_enabled: Joi.boolean(),
  chains_enabled: Joi.boolean(),
  notify_time: Joi.string().pattern(/^\d{2}:\d{2}$/),
  timezone: Joi.string().max(50),
}).min(1);

router.put('/:id/settings', sensitiveWriteLimiter, requireAuth, ensureOwnPartner, (req, res) => {
  const { error, value } = settingsSchema.validate(req.body);
  if (error) return res.status(400).json({ error: error.message });

  const db = getDb();
  const fields = [];
  const params = [];
  for (const [key, dbColumn] of [
    ['notifications_enabled', 'notifications_enabled'],
    ['chains_enabled', 'chains_enabled'],
    ['notify_time', 'notify_time'],
    ['timezone', 'timezone'],
  ]) {
    if (value[key] !== undefined) {
      fields.push(`${dbColumn} = ?`);
      params.push(typeof value[key] === 'boolean' ? (value[key] ? 1 : 0) : value[key]);
    }
  }
  params.push(req.params.id);
  db.prepare(`UPDATE partners SET ${fields.join(', ')} WHERE id = ?`).run(...params);
  logAudit({ userId: req.auth.partner_id, userType: 'partner', action: 'update_settings', entity: 'partners', entityId: req.params.id, details: value });
  res.json(db.prepare('SELECT * FROM partners WHERE id = ?').get(req.params.id));
});

// Право на удаление данных (ФЗ-152)
router.delete('/:id', sensitiveWriteLimiter, requireAuth, ensureOwnPartner, (req, res) => {
  const db = getDb();
  const deleteAll = db.transaction((partnerId) => {
    const clientIds = db.prepare('SELECT id FROM clients WHERE partner_id = ?').all(partnerId).map((c) => c.id);
    for (const clientId of clientIds) {
      db.prepare('DELETE FROM chains WHERE client_id = ?').run(clientId);
      db.prepare('DELETE FROM sales WHERE client_id = ?').run(clientId);
      db.prepare('DELETE FROM notifications WHERE client_id = ?').run(clientId);
    }
    db.prepare('DELETE FROM clients WHERE partner_id = ?').run(partnerId);
    db.prepare('DELETE FROM deadlines WHERE partner_id = ?').run(partnerId);
    db.prepare('DELETE FROM notifications WHERE partner_id = ?').run(partnerId);
    db.prepare('DELETE FROM partners WHERE id = ?').run(partnerId);
  });
  deleteAll(req.params.id);
  logAudit({ userId: req.auth.partner_id, userType: 'partner', action: 'delete_all_data', entity: 'partners', entityId: req.params.id });
  res.json({ ok: true });
});

module.exports = router;
