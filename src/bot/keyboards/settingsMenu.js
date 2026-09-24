const { Markup } = require('telegraf');

function settingsKeyboard(partner) {
  const notifLabel = partner.notifications_enabled ? '☑️ Уведомления о сроках' : '⬜️ Уведомления о сроках';
  const chainsLabel = partner.chains_enabled ? '☑️ Напоминания о цепочках' : '⬜️ Напоминания о цепочках';
  return Markup.inlineKeyboard([
    [Markup.button.callback(notifLabel, 'settings_toggle_notifications')],
    [Markup.button.callback(chainsLabel, 'settings_toggle_chains')],
    [Markup.button.callback('➕ Добавить клиента', 'settings_add_client')],
    [Markup.button.callback('🗑️ Удалить все мои данные', 'settings_delete_data')],
  ]);
}

const deleteConfirmKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback('✅ Да, удалить всё', 'settings_delete_data_confirm')],
  [Markup.button.callback('❌ Отмена', 'settings_delete_data_cancel')],
]);

module.exports = { settingsKeyboard, deleteConfirmKeyboard };
