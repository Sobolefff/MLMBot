const { Markup } = require('telegraf');
const apiClient = require('../apiClient');

function requireSession(ctx) {
  if (!ctx.session?.token) {
    ctx.reply('Сначала завершите регистрацию через /start.');
    return false;
  }
  return true;
}

function daysSince(dateStr) {
  if (!dateStr) return null;
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
}

async function renderClientsList(ctx) {
  const partner = await apiClient.request('/partners/me', { token: ctx.session.token });
  const [clients, chains] = await Promise.all([
    apiClient.request(`/partners/${partner.id}/clients`, { token: ctx.session.token }),
    apiClient.request('/chains/list', { token: ctx.session.token }),
  ]);

  if (!clients.length) {
    await ctx.reply('У вас пока нет клиентов. Добавьте клиента в разделе «⚙️ Настройки».');
    return;
  }

  const chainByClient = new Map(chains.map((c) => [c.client_id, c]));

  for (const client of clients) {
    const chain = chainByClient.get(client.id);
    const days = daysSince(client.last_order_date);
    const warn = chain && days !== null && days >= chain.trigger_days ? ' ⚠️' : '';
    const text =
      `Клиент: ${client.name}\n` +
      `Последний заказ: ${days === null ? '—' : `${days} дней назад`}${warn}\n` +
      `Цепочка: ${chain && chain.is_active ? `включена (порог ${chain.trigger_days} дн.)` : 'выключена'}`;

    const toggleLabel = chain && chain.is_active ? '⏸️ Выключить цепочку' : '▶️ Включить цепочку (10 дней)';
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback(toggleLabel, `chain_toggle_${client.id}`)],
      [Markup.button.callback('🗑️ Удалить клиента', `client_delete_${client.id}`)],
    ]);
    await ctx.reply(text, keyboard);
  }
}

function registerChainsHandler(bot) {
  bot.hears('🔔 Мои цепочки', async (ctx) => {
    if (!requireSession(ctx)) return;
    try {
      await renderClientsList(ctx);
    } catch (err) {
      await ctx.reply(`Ошибка при получении цепочек: ${err.message}`);
    }
  });

  bot.action(/chain_toggle_(\d+)/, async (ctx) => {
    if (!requireSession(ctx)) return ctx.answerCbQuery();
    const clientId = Number(ctx.match[1]);
    await ctx.answerCbQuery();
    try {
      const chains = await apiClient.request('/chains/list', { token: ctx.session.token });
      const existing = chains.find((c) => c.client_id === clientId);
      if (existing && existing.is_active) {
        await apiClient.request(`/chains/${existing.id}`, { method: 'DELETE', token: ctx.session.token });
        await ctx.reply('Цепочка выключена.');
      } else {
        await apiClient.request('/chains/activate', {
          method: 'POST',
          token: ctx.session.token,
          body: { client_id: clientId, trigger_days: 10 },
        });
        await ctx.reply('Цепочка включена: клиенту напомнят о заказе через 10 дней без покупок.');
      }
    } catch (err) {
      await ctx.reply(`Ошибка: ${err.message}`);
    }
  });

  bot.action(/client_delete_(\d+)/, async (ctx) => {
    if (!requireSession(ctx)) return ctx.answerCbQuery();
    const clientId = Number(ctx.match[1]);
    await ctx.answerCbQuery();
    try {
      const partner = await apiClient.request('/partners/me', { token: ctx.session.token });
      await apiClient.request(`/partners/${partner.id}/clients/${clientId}`, {
        method: 'DELETE',
        token: ctx.session.token,
      });
      await ctx.reply('Клиент удалён.');
    } catch (err) {
      await ctx.reply(`Ошибка при удалении клиента: ${err.message}`);
    }
  });
}

module.exports = { registerChainsHandler };
