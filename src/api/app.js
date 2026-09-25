const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const config = require('../config');
const authRoutes = require('./routes/auth');
const partnersRoutes = require('./routes/partners');
const pvCalcRoutes = require('./routes/pvCalc');
const chainsRoutes = require('./routes/chains');
const deadlinesRoutes = require('./routes/deadlines');
const catalogRoutes = require('./routes/catalog');

function createApp() {
  const app = express();
  app.use(helmet());

  // This API has no browser-facing frontend today (only the Telegram bot and
  // server-to-server callers use it), so cross-origin browser requests are
  // denied by default. If/when an admin panel or web client is added, list
  // its origin(s) in ALLOWED_ORIGINS (comma-separated) in .env.
  app.use(
    cors({
      origin(origin, callback) {
        if (!origin) return callback(null, true); // non-browser clients don't send Origin
        if (config.allowedOrigins.includes(origin)) return callback(null, true);
        return callback(null, false);
      },
    })
  );

  // Cap request body size to reduce DoS risk from oversized payloads.
  app.use(express.json({ limit: '100kb' }));

  app.get('/health', (req, res) => res.json({ status: 'ok' }));

  app.use('/api/v1/auth', authRoutes);
  app.use('/api/v1/partners', partnersRoutes);
  app.use('/api/v1/pv-calc', pvCalcRoutes);
  app.use('/api/v1/chains', chainsRoutes);
  app.use('/api/v1/deadlines', deadlinesRoutes);
  app.use('/api/v1/catalog', catalogRoutes);

  app.use((err, req, res, next) => {
    // eslint-disable-next-line no-console
    console.error(err);
    // Malformed JSON / oversized body errors from express.json() carry their
    // own safe status codes — surface those without leaking internals.
    if (err.type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'Malformed JSON body' });
    }
    if (err.type === 'entity.too.large') {
      return res.status(413).json({ error: 'Request body too large' });
    }
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}

module.exports = { createApp };
