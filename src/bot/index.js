const { Telegraf, session } = require('telegraf');
const config = require('../config');
const logger = require('../utils/logger');
const { registerStartHandler } = require('./handlers/start');
const { registerPvCalcHandler } = require('./handlers/pvCalc');
const { registerChainsHandler } = require('./handlers/chains');
const { registerDeadlinesHandler } = require('./handlers/deadlines');
const { registerSettingsHandler } = require('./handlers/settings');
const { registerCatalogHandler } = require('./handlers/catalog');

config.assertProductionSecrets();

if (!config.botToken) {
  logger.error('BOT_TOKEN is not set. Add it to .env before starting the bot.');
  process.exit(1);
}

const bot = new Telegraf(config.botToken, { telegram: { apiRoot: config.telegramApiRoot } });
if (config.telegramApiRoot !== 'https://api.telegram.org') {
  logger.info(`Using self-hosted Telegram Bot API server at ${config.telegramApiRoot}`);
}

bot.use(session());

registerStartHandler(bot);
registerPvCalcHandler(bot);
registerChainsHandler(bot);
registerDeadlinesHandler(bot);
registerSettingsHandler(bot);
registerCatalogHandler(bot);

bot.hears('❓ Помощь', (ctx) =>
  ctx.reply(
    'Доступные команды:\n' +
      '/start — регистрация\n' +
      '📊 PV-Подборщик — подбор товаров под целевой PV/сумму\n' +
      '🔔 Мои цепочки — статус клиентов\n' +
      '⏰ Сроки — активные дедлайны\n' +
      '📎 Пришлите PDF-каталог Greenway файлом — бот обновит базу товаров'
  )
);

bot.catch((err, ctx) => {
  // Avoid logging the full update object: it can contain PII (phone numbers,
  // names, free-text messages) that should not land in plaintext logs (ФЗ-152).
  logger.error('Bot error', {
    error: err.message,
    updateId: ctx.update && ctx.update.update_id,
    updateType: ctx.updateType,
    chatId: ctx.chat && ctx.chat.id,
  });
});

bot.launch();
logger.info('Telegram bot started');

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
