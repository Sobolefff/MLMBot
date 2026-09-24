const cron = require('node-cron');
const config = require('../config');
const { getDb } = require('../database/db');
const { decryptToken } = require('../greenway/tokenCrypto');
const { GreenwayClient } = require('../greenway/client');
const { syncCatalog } = require('../greenway/catalogSync');
const logger = require('../utils/logger');

/**
 * Refreshes the product catalog daily using the first active
 * greenway_accounts row as a service account — the catalog itself doesn't
 * vary per partner, so any single valid token can sync it for everyone.
 * No-ops (with a log line) until at least one partner has connected their
 * Greenway account, since there's no token to sync with yet.
 */
async function runCatalogSync() {
  const db = getDb();
  const account = db
    .prepare('SELECT * FROM greenway_accounts WHERE is_active = 1 AND access_token_encrypted IS NOT NULL LIMIT 1')
    .get();
  if (!account) {
    logger.info('Catalog sync skipped: no connected Greenway account yet');
    return 0;
  }

  const accessToken = decryptToken(account.access_token_encrypted);
  const client = new GreenwayClient(accessToken);
  const count = await syncCatalog(client);
  db.prepare('UPDATE greenway_accounts SET last_synced_at = CURRENT_TIMESTAMP WHERE id = ?').run(account.id);
  return count;
}

function startCatalogCron() {
  cron.schedule(config.parserCron, async () => {
    try {
      const count = await runCatalogSync();
      logger.info(`Catalog cron: synced ${count} products`);
    } catch (err) {
      logger.error('Catalog cron failed', { error: err.message });
    }
  });
  logger.info(`Catalog cron scheduled (${config.parserCron})`);
}

if (require.main === module) {
  startCatalogCron();
}

module.exports = { startCatalogCron, runCatalogSync };
