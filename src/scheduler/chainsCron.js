const cron = require('node-cron');
const { checkAndNotifyChains } = require('../api/services/chainsService');
const logger = require('../utils/logger');

// Runs once a day at 10:00 server time — checks all active chains for the
// 10+ days without an order trigger and enqueues reminders for eligible clients.
const SCHEDULE = '0 10 * * *';

function startChainsCron() {
  cron.schedule(SCHEDULE, async () => {
    try {
      const count = await checkAndNotifyChains();
      logger.info(`Chains cron: enqueued ${count} client notifications`);
    } catch (err) {
      logger.error('Chains cron failed', { error: err.message });
    }
  });
  logger.info(`Chains cron scheduled (${SCHEDULE})`);
}

if (require.main === module) {
  startChainsCron();
}

module.exports = { startChainsCron };
