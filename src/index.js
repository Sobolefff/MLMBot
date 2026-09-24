const { createApp } = require('./api/app');
const config = require('./config');
const logger = require('./utils/logger');
const { startChainsCron } = require('./scheduler/chainsCron');

config.assertProductionSecrets();

const app = createApp();

app.listen(config.port, () => {
  logger.info(`Greenway bot API listening on port ${config.port}`);
});

startChainsCron();
