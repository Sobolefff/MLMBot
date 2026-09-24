const Queue = require('bull');
const config = require('../../config');
const { getDb } = require('../../database/db');
const { logAudit } = require('../../utils/audit');
const logger = require('../../utils/logger');

const DAY_MS = 24 * 60 * 60 * 1000;

let queue;
function getChainQueue() {
  if (!queue) {
    queue = new Queue('chain-notifications', config.redisUrl);
  }
  return queue;
}

/**
 * Pure eligibility check: a chain fires when the client has gone
 * >= trigger_days since their last order (or since becoming a client, if
 * they never ordered), and hasn't already been notified within that same
 * window. Exported separately so it can be unit tested without a DB/Redis.
 */
function isChainDue(chain, now = Date.now()) {
  const referenceDate = chain.last_order_date || chain.client_created_at;
  if (!referenceDate) return false;

  const daysSinceOrder = (now - new Date(referenceDate).getTime()) / DAY_MS;
  if (daysSinceOrder < chain.trigger_days) return false;

  const daysSinceLastNotified = chain.last_notified_at
    ? (now - new Date(chain.last_notified_at).getTime()) / DAY_MS
    : Infinity;
  return daysSinceLastNotified >= chain.trigger_days;
}

function buildRecommendation(products) {
  if (products.length === 0) {
    return '👋 Привет! Давно вас не видели! Загляните в каталог Greenway — там много новинок.';
  }
  const lines = products.map((p) => `📦 ${p.name} (${p.price}₽)`);
  return `👋 Привет! Давно вас не видели!\n\nВот что сейчас популярно:\n${lines.join('\n')}`;
}

/**
 * Finds clients whose chain trigger has fired (no order for >= trigger_days,
 * and not already notified within the current period) and enqueues a
 * reminder to be sent to the client via Telegram. Meant to run on a
 * recurring schedule (see src/scheduler/chainsCron.js).
 */
async function checkAndNotifyChains() {
  const db = getDb();
  const now = Date.now();

  const chains = db
    .prepare(
      `SELECT chains.*, clients.telegram_id AS client_telegram_id, clients.name AS client_name,
              clients.last_order_date, clients.created_at AS client_created_at
       FROM chains
       JOIN clients ON clients.id = chains.client_id
       WHERE chains.is_active = 1 AND clients.telegram_id IS NOT NULL`
    )
    .all();

  const recommendedProducts = db
    .prepare('SELECT id, name, price FROM products WHERE is_available = 1 ORDER BY pv DESC LIMIT 3')
    .all();

  let notifiedCount = 0;

  for (const chain of chains) {
    if (!isChainDue(chain, now)) continue;

    const body = buildRecommendation(recommendedProducts);
    const info = db
      .prepare(
        `INSERT INTO notifications (partner_id, client_id, type, title, body, scheduled_for)
         VALUES (?, ?, 'chain', 'Напоминание о заказе', ?, CURRENT_TIMESTAMP)`
      )
      .run(chain.partner_id, chain.client_id, body);

    try {
      await getChainQueue().add({ notificationId: info.lastInsertRowid, clientId: chain.client_id });
      db.prepare(
        'UPDATE chains SET last_notified_at = CURRENT_TIMESTAMP, notification_count = notification_count + 1 WHERE id = ?'
      ).run(chain.id);
      logAudit({
        userId: chain.partner_id,
        userType: 'partner',
        action: 'chain_notification_enqueued',
        entity: 'chains',
        entityId: chain.id,
        details: { client_id: chain.client_id },
      });
      notifiedCount += 1;
    } catch (err) {
      logger.error('Failed to enqueue chain notification', { error: err.message, chainId: chain.id });
    }
  }

  return notifiedCount;
}

module.exports = { checkAndNotifyChains, getChainQueue, isChainDue };
