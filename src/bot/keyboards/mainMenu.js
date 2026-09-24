const { Markup } = require('telegraf');

const mainMenuKeyboard = Markup.keyboard([
  ['📊 PV-Подборщик', '🔔 Мои цепочки'],
  ['⏰ Сроки', '⚙️ Настройки'],
  ['❓ Помощь'],
]).resize();

const consentKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback('✅ Согласен', 'consent_accept')],
  [Markup.button.callback('❌ Не согласен', 'consent_decline')],
]);

module.exports = { mainMenuKeyboard, consentKeyboard };
