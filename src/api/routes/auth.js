const express = require('express');
const rateLimit = require('express-rate-limit');
const Joi = require('joi');
const authService = require('../services/authService');

const router = express.Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Слишком много попыток. Повторите позже.' },
});

router.use(authLimiter);

const registerSchema = Joi.object({
  telegram_id: Joi.number().integer().required(),
  name: Joi.string().min(1).max(200).required(),
  phone: Joi.string().min(5).max(30).required(),
  greenway_id: Joi.string().max(50).allow(null, ''),
  consent_data_processing: Joi.boolean().valid(true).required(),
  consent_notifications: Joi.boolean().default(false),
});

router.post('/register', (req, res) => {
  const { error, value } = registerSchema.validate(req.body);
  if (error) return res.status(400).json({ error: error.message });
  try {
    const { partner, token } = authService.register(value);
    res.json({ partner_id: partner.id, session_token: token });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

const loginSchema = Joi.object({
  telegram_id: Joi.number().integer().required(),
});

router.post('/login', (req, res) => {
  const { error, value } = loginSchema.validate(req.body);
  if (error) return res.status(400).json({ error: error.message });
  try {
    const { token } = authService.login(value);
    res.json({ session_token: token, expires_at: null });
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

module.exports = router;
