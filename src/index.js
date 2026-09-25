const { createApp } = require('./api/app');
const config = require('./config');
const logger = require('./utils/logger');
// const { startChainsCron } = require('./scheduler/chainsCron'); // see PAUSED note below
// const { startCatalogCron } = require('./scheduler/catalogCron'); // see PAUSED note below

config.assertProductionSecrets();

const app = createApp();

app.listen(config.port, () => {
  logger.info(`Greenway bot API listening on port ${config.port}`);
});

// PAUSED 2026-09-25 by user request: "Мои цепочки" (both this cron and the
// bot's "🔔 Мои цепочки" menu - see src/bot/index.js) relies on
// clients.last_order_date, which is never populated without a personal-
// cabinet order sync that doesn't exist yet. Re-enable once that sync exists.
// startChainsCron();

// PAUSED 2026-09-24: a handful of manual pyapi sync attempts got a real
// partner's IPs temporarily blocked by Greenway's anti-bot system. Do not
// re-enable until the user explicitly signs off — see TODO.md and memory
// `reference-greenway-pyapi`. (The connected greenway_accounts row was also
// deactivated, so even a manual `npm run gw:sync-catalog` no-ops for now.)
// startCatalogCron();
