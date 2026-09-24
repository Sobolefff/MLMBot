const { createApp } = require('./api/app');
const config = require('./config');
const logger = require('./utils/logger');
const { startChainsCron } = require('./scheduler/chainsCron');
const { startCatalogCron } = require('./scheduler/catalogCron');

config.assertProductionSecrets();

const app = createApp();

app.listen(config.port, () => {
  logger.info(`Greenway bot API listening on port ${config.port}`);
});

startChainsCron();
startCatalogCron();
