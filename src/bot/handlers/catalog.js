const apiClient = require('../apiClient');

// The cloud Telegram Bot API refuses to hand bots files above this size via
// getFile/getFileLink regardless of our own limits - fail fast with a clear
// message instead of a confusing download error.
const MAX_TELEGRAM_FILE_BYTES = 20 * 1024 * 1024;

function isPdfDocument(document) {
  if (!document) return false;
  if (document.mime_type === 'application/pdf') return true;
  return /\.pdf$/i.test(document.file_name || '');
}

function registerCatalogHandler(bot) {
  bot.on('document', async (ctx, next) => {
    const document = ctx.message.document;
    if (!isPdfDocument(document)) return next();

    if (!ctx.session?.token) {
      await ctx.reply('Сначала завершите регистрацию через /start, затем пришлите PDF-каталог ещё раз.');
      return;
    }

    if (document.file_size && document.file_size > MAX_TELEGRAM_FILE_BYTES) {
      await ctx.reply(
        '⚠️ Файл больше 20 МБ — Telegram не отдаёт боту такие файлы напрямую. ' +
          'Пришлите более лёгкую версию каталога (например, без картинок) или уточните у поддержки.'
      );
      return;
    }

    try {
      await ctx.reply('🔄 Получил PDF-каталог, разбираю товары — это может занять около минуты...');

      const fileLink = await ctx.telegram.getFileLink(document.file_id);
      const fileRes = await fetch(fileLink.href || fileLink);
      if (!fileRes.ok) throw new Error(`Не удалось скачать файл из Telegram (HTTP ${fileRes.status})`);
      const buffer = Buffer.from(await fileRes.arrayBuffer());

      const result = await apiClient.requestRaw('/catalog/import-pdf', {
        token: ctx.session.token,
        body: buffer,
        contentType: 'application/pdf',
      });

      await ctx.reply(
        `✅ Каталог обновлён: ${result.total} товаров в ${result.categories} категориях. ` +
          'Изменения сразу доступны в PV-Подборщике.'
      );
    } catch (err) {
      await ctx.reply(`❌ Не удалось обновить каталог: ${err.message}`);
    }
  });
}

module.exports = { registerCatalogHandler, isPdfDocument, MAX_TELEGRAM_FILE_BYTES };
