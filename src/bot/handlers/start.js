const { mainMenuKeyboard, consentKeyboard } = require('../keyboards/mainMenu');
const apiClient = require('../apiClient');

function registerStartHandler(bot) {
  bot.start(async (ctx) => {
    ctx.session ??= {};
    ctx.session.registration = { step: 'consent' };
    await ctx.reply(
      'Добро пожаловать в бот Greenway CRM! 👋\n\n' +
        'Для регистрации подтвердите согласие на обработку персональных данных ' +
        'и получение уведомлений в соответствии с ФЗ-152.',
      consentKeyboard
    );
  });

  bot.action('consent_accept', async (ctx) => {
    ctx.session ??= {};
    ctx.session.registration = { step: 'name', consent: true };
    await ctx.answerCbQuery();
    await ctx.reply('Спасибо! Как вас зовут (ФИО)?');
  });

  bot.action('consent_decline', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.reply('Без согласия на обработку данных бот не может продолжить регистрацию.');
  });

  bot.on('text', async (ctx, next) => {
    const registration = ctx.session?.registration;
    if (!registration || registration.step === 'done') return next();

    if (registration.step === 'name') {
      registration.name = ctx.message.text.trim();
      registration.step = 'phone';
      await ctx.reply('Укажите номер телефона:');
      return;
    }

    if (registration.step === 'phone') {
      registration.phone = ctx.message.text.trim();
      try {
        const { partner_id, session_token } = await apiClient.request('/auth/register', {
          method: 'POST',
          body: {
            telegram_id: ctx.from.id,
            name: registration.name,
            phone: registration.phone,
            consent_data_processing: true,
            consent_notifications: true,
          },
        });
        ctx.session.partnerId = partner_id;
        ctx.session.token = session_token;
        registration.step = 'done';
        await ctx.reply('Регистрация завершена! Выберите раздел в меню ниже.', mainMenuKeyboard);
      } catch (err) {
        await ctx.reply(`Не удалось завершить регистрацию: ${err.message}`);
      }
      return;
    }

    return next();
  });
}

module.exports = { registerStartHandler };
