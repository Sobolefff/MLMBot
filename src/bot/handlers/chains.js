const apiClient = require('../apiClient');

function registerChainsHandler(bot) {
  bot.hears('🔔 Мои цепочки', async (ctx) => {
    if (!ctx.session?.token) {
      await ctx.reply('Сначала завершите регистрацию через /start.');
      return;
    }
    try {
      const chains = await apiClient.request('/chains/list', { token: ctx.session.token });
      if (!chains.length) {
        await ctx.reply('У вас пока нет активных цепочек. Добавьте клиента через раздел настроек.');
        return;
      }
      const lines = chains.map((c) => {
        const days = c.last_order_date
          ? Math.floor((Date.now() - new Date(c.last_order_date).getTime()) / 86400000)
          : '—';
        const warn = typeof days === 'number' && days >= c.trigger_days ? ' ⚠️' : '';
        return `Клиент: ${c.client_name} | Последний заказ: ${days} дней назад${warn}`;
      });
      await ctx.reply(lines.join('\n'));
    } catch (err) {
      await ctx.reply(`Ошибка при получении цепочек: ${err.message}`);
    }
  });
}

module.exports = { registerChainsHandler };
