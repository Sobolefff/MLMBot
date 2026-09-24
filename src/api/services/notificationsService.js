const Queue = require('bull');
const config = require('../../config');
const { getDb } = require('../../database/db');
const logger = require('../../utils/logger');

const OFFSETS_MS = [
  { label: '-72h', ms: 72 * 60 * 60 * 1000 },
  { label: '-24h', ms: 24 * 60 * 60 * 1000 },
  { label: '-2h', ms: 2 * 60 * 60 * 1000 },
  { label: '0h', ms: 0 },
];

let queue;
function getQueue() {
  if (!queue) {
    queue = new Queue('deadline-notifications', config.redisUrl);
  }
  return queue;
}

function buildMessage(label, deadline) {
  switch (label) {
    case '-72h':
      return `3 дня до дедлайна «${deadline.title || 'Цель по PV'}»! Проверьте прогресс.`;
    case '-24h':
      return 'Последние 24 часа! Осталось совсем немного времени.';
    case '-2h':
      return '⚠️ КРИТИЧНО! Осталось 2 часа до дедлайна.';
    case '0h':
    default:
      return '❌ Дедлайн истёк. Проверьте итоговый результат.';
  }
}

/**
 * Schedules the -72h/-24h/-2h/0h notification set for a deadline. Past-due
 * offsets (deadline created close to or after the trigger time) are skipped.
 */
async function scheduleDeadlineNotifications(deadline) {
  const db = getDb();
  const deadlineTime = new Date(deadline.deadline_at).getTime();
  const now = Date.now();
  let scheduledCount = 0;

  for (const { label, ms } of OFFSETS_MS) {
    const fireAt = deadlineTime - ms;
    if (fireAt <= now) continue;

    const body = buildMessage(label, deadline);
    const info = db
      .prepare(
        `INSERT INTO notifications (partner_id, type, title, body, scheduled_for)
         VALUES (?, 'deadline', ?, ?, ?)`
      )
      .run(deadline.partner_id, `Дедлайн: ${label}`, body, new Date(fireAt).toISOString());

    try {
      await getQueue().add(
        { notificationId: info.lastInsertRowid, deadlineId: deadline.id },
        { delay: Math.max(0, fireAt - now) }
      );
      scheduledCount += 1;
    } catch (err) {
      logger.error('Failed to enqueue deadline notification', { error: err.message });
    }
  }
  return scheduledCount;
}

module.exports = { scheduleDeadlineNotifications, OFFSETS_MS };
