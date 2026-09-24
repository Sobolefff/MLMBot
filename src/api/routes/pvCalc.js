const express = require('express');
const Joi = require('joi');
const { getDb } = require('../../database/db');
const { requireAuth } = require('../middleware/auth');
const pvCalcService = require('../services/pvCalc');

const router = express.Router();

const searchSchema = Joi.object({
  target_pv: Joi.number().positive(),
  target_price: Joi.number().positive(),
  max_items: Joi.number().integer().min(1).max(20).default(10),
  excluded_categories: Joi.array().items(Joi.string()).default([]),
}).xor('target_pv', 'target_price');

router.post('/search', requireAuth, (req, res) => {
  const { error, value } = searchSchema.validate(req.body);
  if (error) return res.status(400).json({ error: error.message });

  const db = getDb();
  const products = db.prepare('SELECT * FROM products WHERE is_available = 1').all();
  try {
    const result = pvCalcService.search(products, value);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/products', requireAuth, (req, res) => {
  const db = getDb();
  const { category, search } = req.query;
  let query = 'SELECT * FROM products WHERE is_available = 1';
  const params = [];
  if (category) {
    query += ' AND category = ?';
    params.push(category);
  }
  if (search) {
    query += ' AND name LIKE ?';
    params.push(`%${search}%`);
  }
  res.json(db.prepare(query).all(...params));
});

module.exports = router;
