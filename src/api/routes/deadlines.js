const express = require('express');
const Joi = require('joi');
const { getDb } = require('../../database/db');
const { requireAuth } = require('../middleware/auth');
const { logAudit } = require('../../utils/audit');
const { scheduleDeadlineNotifications } = require('../services/notificationsService');

const router = express.Router();

const createSchema = Joi.object({
  title: Joi.string().max(200).allow(null, ''),
  target_pv: Joi.number().integer().positive().required(),
  deadline_at: Joi.date().iso().required(),
});

router.post('/create', requireAuth, async (req, res) => {
  const { error, value } = createSchema.validate(req.body);
  if (error) return res.status(400).json({ error: error.message });

  const db = getDb();
  const info = db
    .prepare('INSERT INTO deadlines (partner_id, title, target_pv, deadline_at) VALUES (?, ?, ?, ?)')
    .run(req.auth.partner_id, value.title || null, value.target_pv, value.deadline_at.toISOString());
  const deadline = db.prepare('SELECT * FROM deadlines WHERE id = ?').get(info.lastInsertRowid);
  const scheduled = await scheduleDeadlineNotifications(deadline);
  logAudit({ userId: req.auth.partner_id, userType: 'partner', action: 'create_deadline', entity: 'deadlines', entityId: deadline.id });
  res.json({ deadline_id: deadline.id, notifications_scheduled: scheduled });
});

router.get('/list', requireAuth, (req, res) => {
  const db = getDb();
  res.json(db.prepare('SELECT * FROM deadlines WHERE partner_id = ? ORDER BY deadline_at ASC').all(req.auth.partner_id));
});

const updateSchema = Joi.object({
  current_pv: Joi.number().integer().min(0).required(),
});

router.put('/:id', requireAuth, (req, res) => {
  const { error, value } = updateSchema.validate(req.body);
  if (error) return res.status(400).json({ error: error.message });

  const db = getDb();
  const deadline = db.prepare('SELECT * FROM deadlines WHERE id = ? AND partner_id = ?').get(req.params.id, req.auth.partner_id);
  if (!deadline) return res.status(404).json({ error: 'Deadline not found' });

  db.prepare('UPDATE deadlines SET current_pv = ? WHERE id = ?').run(value.current_pv, deadline.id);
  if (value.current_pv >= deadline.target_pv) {
    db.prepare("UPDATE deadlines SET status = 'completed' WHERE id = ?").run(deadline.id);
  }
  logAudit({ userId: req.auth.partner_id, userType: 'partner', action: 'update_deadline', entity: 'deadlines', entityId: deadline.id });
  res.json(db.prepare('SELECT * FROM deadlines WHERE id = ?').get(deadline.id));
});

module.exports = router;
