const apiClient = require('../apiClient');
const config = require('../../config');

// The cloud Telegram Bot API (api.telegram.org) refuses to hand bots files
// above this size via getFile/getFileLink no matter what we configure - it's
// a hard wall on Telegram's side. A self-hosted Bot API server (see README
// "Self-hosted Bot API сервер") removes it, and MAX_PDF_UPLOAD_MB below
// becomes the effective limit instead.
const CLOUD_API_FILE_LIMIT_BYTES = 20 * 1024 * 1024;
const USING_SELF_HOSTED_API = config.telegramApiRoot !== 'https://api.telegram.org';
const MAX_UPLOAD_BYTES = config.maxPdfUploadMb * 1024 * 1024;

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

    if (!USING_SELF_HOSTED_API && document.file_size && document.file_size > CLOUD_API_FILE_LIMIT_BYTES) {
      await ctx.reply(
        '⚠️ Файл больше 20 МБ — облачный Telegram Bot API не отдаёт боту такие файлы напрямую. ' +
          'Пришлите более лёгкую версию каталога (например, без картинок) либо попросите администратора ' +
          'бота подключить self-hosted Bot API сервер (см. README) — тогда лимит снимается.'
      );
      return;
    }

    if (document.file_size && document.file_size > MAX_UPLOAD_BYTES) {
      await ctx.reply(`⚠️ Файл больше ${config.maxPdfUploadMb} МБ — это больше, чем бот готов принять за раз.`);
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

module.exports = { registerCatalogHandler, isPdfDocument, CLOUD_API_FILE_LIMIT_BYTES, MAX_UPLOAD_BYTES };
