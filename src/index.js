const { createApp } = require('./api/app');
const config = require('./config');
const logger = require('./utils/logger');
const { startChainsCron } = require('./scheduler/chainsCron');
// const { startCatalogCron } = require('./scheduler/catalogCron'); // see PAUSED note below

config.assertProductionSecrets();

const app = createApp();

app.listen(config.port, () => {
  logger.info(`Greenway bot API listening on port ${config.port}`);
});

startChainsCron();

// PAUSED 2026-09-24: a handful of manual pyapi sync attempts got a real
// partner's IPs temporarily blocked by Greenway's anti-bot system. Do not
// re-enable until the user explicitly signs off — see TODO.md and memory
// `reference-greenway-pyapi`. (The connected greenway_accounts row was also
// deactivated, so even a manual `npm run gw:sync-catalog` no-ops for now.)
// startCatalogCron();
