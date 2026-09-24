const express = require('express');
const Joi = require('joi');
const { getDb } = require('../../database/db');
const { requireAuth } = require('../middleware/auth');
const { logAudit } = require('../../utils/audit');

const router = express.Router();

router.get('/list', requireAuth, (req, res) => {
  const db = getDb();
  const chains = db
    .prepare(
      `SELECT chains.*, clients.name AS client_name, clients.last_order_date
       FROM chains JOIN clients ON clients.id = chains.client_id
       WHERE chains.partner_id = ?`
    )
    .all(req.auth.partner_id);
  res.json(chains);
});

const activateSchema = Joi.object({
  client_id: Joi.number().integer().required(),
  trigger_days: Joi.number().integer().min(1).max(90).default(10),
});

router.post('/activate', requireAuth, (req, res) => {
  const { error, value } = activateSchema.validate(req.body);
  if (error) return res.status(400).json({ error: error.message });

  const db = getDb();
  const client = db.prepare('SELECT * FROM clients WHERE id = ? AND partner_id = ?').get(value.client_id, req.auth.partner_id);
  if (!client) return res.status(404).json({ error: 'Client not found' });

  const existing = db.prepare('SELECT * FROM chains WHERE client_id = ? AND partner_id = ?').get(value.client_id, req.auth.partner_id);
  let chain;
  if (existing) {
    db.prepare('UPDATE chains SET trigger_days = ?, is_active = 1 WHERE id = ?').run(value.trigger_days, existing.id);
    chain = db.prepare('SELECT * FROM chains WHERE id = ?').get(existing.id);
  } else {
    const info = db
      .prepare('INSERT INTO chains (partner_id, client_id, trigger_days) VALUES (?, ?, ?)')
      .run(req.auth.partner_id, value.client_id, value.trigger_days);
    chain = db.prepare('SELECT * FROM chains WHERE id = ?').get(info.lastInsertRowid);
  }
  logAudit({ userId: req.auth.partner_id, userType: 'partner', action: 'activate_chain', entity: 'chains', entityId: chain.id });
  res.json(chain);
});

router.delete('/:id', requireAuth, (req, res) => {
  const db = getDb();
  const chain = db.prepare('SELECT * FROM chains WHERE id = ? AND partner_id = ?').get(req.params.id, req.auth.partner_id);
  if (!chain) return res.status(404).json({ error: 'Chain not found' });
  db.prepare('UPDATE chains SET is_active = 0 WHERE id = ?').run(chain.id);
  logAudit({ userId: req.auth.partner_id, userType: 'partner', action: 'deactivate_chain', entity: 'chains', entityId: chain.id });
  res.json({ ok: true });
});

module.exports = router;
