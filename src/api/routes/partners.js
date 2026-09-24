const express = require('express');
const Joi = require('joi');
const { getDb } = require('../../database/db');
const { requireAuth } = require('../middleware/auth');
const { logAudit } = require('../../utils/audit');

const router = express.Router();

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

module.exports = router;
