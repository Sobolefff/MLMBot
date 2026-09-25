const apiClient = require('../apiClient');

function formatCombo(combo, index) {
  const lines = combo.items.map((item) => {
    const line = `  • ${item.name} — ${item.quantity} × ${item.price}₽ (${item.pv} PV)`;
    return item.product_url ? `${line}\n    ${item.product_url}` : line;
  });
  return (
    `Вариант ${index + 1}️⃣ | Сумма: ${combo.total_price}₽ | PV: ${combo.total_pv}\n` +
    lines.join('\n')
  );
}

function registerPvCalcHandler(bot) {
  bot.hears('📊 PV-Подборщик', async (ctx) => {
    ctx.session ??= {};
    ctx.session.pvCalc = { step: 'awaiting_target' };
    await ctx.reply('Какую сумму (в ₽) или PV вы хотите собрать? Например: "5000 RUB" или "150 PV"');
  });

  bot.on('text', async (ctx, next) => {
    if (ctx.session?.pvCalc?.step !== 'awaiting_target') return next();
    ctx.session.pvCalc.step = null;

    const text = ctx.message.text.trim().toUpperCase();
    const isPv = text.includes('PV');
    const numberMatch = text.match(/[\d.]+/);
    if (!numberMatch) {
      await ctx.reply('Не удалось распознать число. Попробуйте снова, например: "5000 RUB".');
      return;
    }
    const value = parseFloat(numberMatch[0]);
    const body = isPv ? { target_pv: value } : { target_price: value };

    try {
      const { results } = await apiClient.request('/pv-calc/search', {
        method: 'POST',
        body,
        token: ctx.session.token,
      });
      if (!results.length) {
        await ctx.reply('Не удалось найти подходящую комбинацию товаров.');
        return;
      }
      const text = results.map(formatCombo).join('\n\n');
      await ctx.reply(text);
    } catch (err) {
      await ctx.reply(`Ошибка при подборе товаров: ${err.message}`);
    }
  });
}

module.exports = { registerPvCalcHandler, formatCombo };
