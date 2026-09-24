const express = require('express');
const authRoutes = require('./routes/auth');
const partnersRoutes = require('./routes/partners');
const pvCalcRoutes = require('./routes/pvCalc');
const chainsRoutes = require('./routes/chains');
const deadlinesRoutes = require('./routes/deadlines');

function createApp() {
  const app = express();
  app.use(express.json());

  app.get('/health', (req, res) => res.json({ status: 'ok' }));

  app.use('/api/v1/auth', authRoutes);
  app.use('/api/v1/partners', partnersRoutes);
  app.use('/api/v1/pv-calc', pvCalcRoutes);
  app.use('/api/v1/chains', chainsRoutes);
  app.use('/api/v1/deadlines', deadlinesRoutes);

  app.use((err, req, res, next) => {
    // eslint-disable-next-line no-console
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}

module.exports = { createApp };
