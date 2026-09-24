const Queue = require('bull');
const { Telegraf } = require('telegraf');
const config = require('../config');
const logger = require('../utils/logger');
const { getDb } = require('../database/db');

if (!config.botToken) {
  logger.error('BOT_TOKEN is not set. Add it to .env before starting the worker.');
  process.exit(1);
}

const bot = new Telegraf(config.botToken);
const deadlineQueue = new Queue('deadline-notifications', config.redisUrl);
const chainQueue = new Queue('chain-notifications', config.redisUrl);

async function deliver(notificationId, telegramId) {
  const db = getDb();
  const notification = db.prepare('SELECT * FROM notifications WHERE id = ?').get(notificationId);
  if (!notification || notification.is_sent) return;

  await bot.telegram.sendMessage(telegramId, `${notification.title}\n\n${notification.body}`);
  db.prepare('UPDATE notifications SET is_sent = 1, sent_at = CURRENT_TIMESTAMP WHERE id = ?').run(notification.id);
}

deadlineQueue.process(async (job) => {
  const db = getDb();
  const notification = db.prepare('SELECT * FROM notifications WHERE id = ?').get(job.data.notificationId);
  if (!notification || notification.is_sent) return;

  const partner = db.prepare('SELECT * FROM partners WHERE id = ?').get(notification.partner_id);
  if (!partner) {
    logger.error('Notification worker: partner not found', { partnerId: notification.partner_id });
    return;
  }
  await deliver(notification.id, partner.telegram_id);
});

chainQueue.process(async (job) => {
  const db = getDb();
  const notification = db.prepare('SELECT * FROM notifications WHERE id = ?').get(job.data.notificationId);
  if (!notification || notification.is_sent) return;

  const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(notification.client_id);
  if (!client || !client.telegram_id) {
    logger.error('Notification worker: client not found or has no telegram_id', { clientId: notification.client_id });
    return;
  }
  await deliver(notification.id, client.telegram_id);
});

deadlineQueue.on('failed', (job, err) => {
  logger.error('Deadline notification job failed', { jobId: job.id, error: err.message });
});
chainQueue.on('failed', (job, err) => {
  logger.error('Chain notification job failed', { jobId: job.id, error: err.message });
});

logger.info('Notification worker started');

process.once('SIGINT', () => {
  deadlineQueue.close();
  chainQueue.close();
});
process.once('SIGTERM', () => {
  deadlineQueue.close();
  chainQueue.close();
});
