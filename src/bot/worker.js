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
const queue = new Queue('deadline-notifications', config.redisUrl);

queue.process(async (job) => {
  const db = getDb();
  const notification = db.prepare('SELECT * FROM notifications WHERE id = ?').get(job.data.notificationId);
  if (!notification || notification.is_sent) return;

  const partner = db.prepare('SELECT * FROM partners WHERE id = ?').get(notification.partner_id);
  if (!partner) {
    logger.error('Notification worker: partner not found', { partnerId: notification.partner_id });
    return;
  }

  await bot.telegram.sendMessage(partner.telegram_id, `${notification.title}\n\n${notification.body}`);
  db.prepare('UPDATE notifications SET is_sent = 1, sent_at = CURRENT_TIMESTAMP WHERE id = ?').run(notification.id);
});

queue.on('failed', (job, err) => {
  logger.error('Notification job failed', { jobId: job.id, error: err.message });
});

logger.info('Notification worker started');

process.once('SIGINT', () => queue.close());
process.once('SIGTERM', () => queue.close());
