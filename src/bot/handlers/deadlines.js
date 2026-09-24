const apiClient = require('../apiClient');

function registerDeadlinesHandler(bot) {
  bot.hears('⏰ Сроки', async (ctx) => {
    if (!ctx.session?.token) {
      await ctx.reply('Сначала завершите регистрацию через /start.');
      return;
    }
    try {
      const deadlines = await apiClient.request('/deadlines/list', { token: ctx.session.token });
      if (!deadlines.length) {
        await ctx.reply('Активных сроков нет. Используйте /newdeadline для создания.');
        return;
      }
      const lines = deadlines.map(
        (d) =>
          `${d.title || 'Цель по PV'} | ${d.current_pv}/${d.target_pv} PV | до ${new Date(d.deadline_at).toLocaleString('ru-RU')} | ${d.status}`
      );
      await ctx.reply(lines.join('\n'));
    } catch (err) {
      await ctx.reply(`Ошибка при получении сроков: ${err.message}`);
    }
  });
}

module.exports = { registerDeadlinesHandler };
