const { Telegraf, session } = require('telegraf');
const config = require('../config');
const logger = require('../utils/logger');
const { registerStartHandler } = require('./handlers/start');
const { registerPvCalcHandler } = require('./handlers/pvCalc');
const { registerChainsHandler } = require('./handlers/chains');
const { registerDeadlinesHandler } = require('./handlers/deadlines');

if (!config.botToken) {
  logger.error('BOT_TOKEN is not set. Add it to .env before starting the bot.');
  process.exit(1);
}

const bot = new Telegraf(config.botToken);

bot.use(session());

registerStartHandler(bot);
registerPvCalcHandler(bot);
registerChainsHandler(bot);
registerDeadlinesHandler(bot);

bot.hears('❓ Помощь', (ctx) =>
  ctx.reply(
    'Доступные команды:\n' +
      '/start — регистрация\n' +
      '📊 PV-Подборщик — подбор товаров под целевой PV/сумму\n' +
      '🔔 Мои цепочки — статус клиентов\n' +
      '⏰ Сроки — активные дедлайны'
  )
);

bot.catch((err, ctx) => {
  logger.error('Bot error', { error: err.message, update: ctx.update });
});

bot.launch();
logger.info('Telegram bot started');

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
