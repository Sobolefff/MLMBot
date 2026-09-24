const apiClient = require('../apiClient');
const { settingsKeyboard, deleteConfirmKeyboard } = require('../keyboards/settingsMenu');

function profileText(partner) {
  return (
    `👤 Мой профиль\n` +
    `ФИ: ${partner.name}\n` +
    `Телефон: ${partner.phone}\n` +
    `ID Greenway: ${partner.greenway_id || '—'}\n` +
    `Ранк: ${partner.greenway_rank}\n\n` +
    `Настройте уведомления и данные ниже:`
  );
}

function requireSession(ctx) {
  if (!ctx.session?.token) {
    ctx.reply('Сначала завершите регистрацию через /start.');
    return false;
  }
  return true;
}

function registerSettingsHandler(bot) {
  bot.hears('⚙️ Настройки', async (ctx) => {
    if (!requireSession(ctx)) return;
    try {
      const partner = await apiClient.request('/partners/me', { token: ctx.session.token });
      await ctx.reply(profileText(partner), settingsKeyboard(partner));
    } catch (err) {
      await ctx.reply(`Ошибка при загрузке настроек: ${err.message}`);
    }
  });

  bot.action('settings_toggle_notifications', async (ctx) => {
    if (!requireSession(ctx)) return ctx.answerCbQuery();
    await ctx.answerCbQuery();
    try {
      const partner = await apiClient.request('/partners/me', { token: ctx.session.token });
      const updated = await apiClient.request(`/partners/${partner.id}/settings`, {
        method: 'PUT',
        token: ctx.session.token,
        body: { notifications_enabled: !partner.notifications_enabled },
      });
      await ctx.editMessageText(profileText(updated), settingsKeyboard(updated));
    } catch (err) {
      await ctx.reply(`Ошибка: ${err.message}`);
    }
  });

  bot.action('settings_toggle_chains', async (ctx) => {
    if (!requireSession(ctx)) return ctx.answerCbQuery();
    await ctx.answerCbQuery();
    try {
      const partner = await apiClient.request('/partners/me', { token: ctx.session.token });
      const updated = await apiClient.request(`/partners/${partner.id}/settings`, {
        method: 'PUT',
        token: ctx.session.token,
        body: { chains_enabled: !partner.chains_enabled },
      });
      await ctx.editMessageText(profileText(updated), settingsKeyboard(updated));
    } catch (err) {
      await ctx.reply(`Ошибка: ${err.message}`);
    }
  });

  bot.action('settings_add_client', async (ctx) => {
    if (!requireSession(ctx)) return ctx.answerCbQuery();
    await ctx.answerCbQuery();
    ctx.session.addClient = { step: 'name' };
    await ctx.reply('Введите имя клиента:');
  });

  bot.action('settings_delete_data', async (ctx) => {
    if (!requireSession(ctx)) return ctx.answerCbQuery();
    await ctx.answerCbQuery();
    await ctx.reply(
      '⚠️ Это действие безвозвратно удалит все ваши данные и данные ваших клиентов (ФЗ-152). Продолжить?',
      deleteConfirmKeyboard
    );
  });

  bot.action('settings_delete_data_cancel', async (ctx) => {
    await ctx.answerCbQuery('Отменено');
    await ctx.editMessageText('Удаление отменено.');
  });

  bot.action('settings_delete_data_confirm', async (ctx) => {
    if (!requireSession(ctx)) return ctx.answerCbQuery();
    await ctx.answerCbQuery();
    try {
      const partner = await apiClient.request('/partners/me', { token: ctx.session.token });
      await apiClient.request(`/partners/${partner.id}`, { method: 'DELETE', token: ctx.session.token });
      ctx.session = {};
      await ctx.editMessageText('Все ваши данные удалены. Чтобы начать заново, отправьте /start.');
    } catch (err) {
      await ctx.reply(`Ошибка при удалении данных: ${err.message}`);
    }
  });

  bot.on('text', async (ctx, next) => {
    const addClient = ctx.session?.addClient;
    if (!addClient) return next();

    if (addClient.step === 'name') {
      addClient.name = ctx.message.text.trim();
      addClient.step = 'phone';
      await ctx.reply('Введите телефон клиента (или "-" чтобы пропустить):');
      return;
    }

    if (addClient.step === 'phone') {
      const phone = ctx.message.text.trim();
      try {
        const partner = await apiClient.request('/partners/me', { token: ctx.session.token });
        await apiClient.request(`/partners/${partner.id}/clients`, {
          method: 'POST',
          token: ctx.session.token,
          body: { name: addClient.name, phone: phone === '-' ? null : phone },
        });
        await ctx.reply(`Клиент «${addClient.name}» добавлен. Активировать цепочку для него можно в разделе «🔔 Мои цепочки».`);
      } catch (err) {
        await ctx.reply(`Ошибка при добавлении клиента: ${err.message}`);
      } finally {
        ctx.session.addClient = null;
      }
      return;
    }

    return next();
  });
}

module.exports = { registerSettingsHandler };
