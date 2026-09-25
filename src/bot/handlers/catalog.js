const fs = require('fs/promises');
const apiClient = require('../apiClient');
const config = require('../../config');

// The cloud Telegram Bot API (api.telegram.org) refuses to hand bots files
// above this size via getFile no matter what we configure - a hard wall on
// Telegram's side. A self-hosted Bot API server (see README "Self-hosted Bot
// API сервер") removes it, but ONLY when started with --local (TELEGRAM_LOCAL=1)
// - a plain self-hosted server without --local keeps the exact same 20 MB
// wall (confirmed in practice), it just isn't obvious until you hit it.
const CLOUD_API_FILE_LIMIT_BYTES = 20 * 1024 * 1024;
const USING_CLOUD_API = config.telegramApiRoot === 'https://api.telegram.org';
const MAX_UPLOAD_BYTES = config.maxPdfUploadMb * 1024 * 1024;

function isPdfDocument(document) {
  if (!document) return false;
  if (document.mime_type === 'application/pdf') return true;
  return /\.pdf$/i.test(document.file_name || '');
}

/**
 * Fetches a Telegram-uploaded file's bytes. In --local mode, getFile returns
 * an absolute filesystem path on the volume shared with the telegram-bot-api
 * container instead of something to download over HTTP - reading it directly
 * avoids a pointless HTTP round-trip and, more importantly, is the only way
 * this actually works (getFileLink would build a broken URL from that path).
 */
async function fetchTelegramFileBuffer(ctx, fileId) {
  const file = await ctx.telegram.getFile(fileId);
  if (file.file_path && file.file_path.startsWith('/')) {
    return fs.readFile(file.file_path);
  }
  const fileLink = await ctx.telegram.getFileLink(fileId);
  const res = await fetch(fileLink.href || fileLink);
  if (!res.ok) throw new Error(`Не удалось скачать файл из Telegram (HTTP ${res.status})`);
  return Buffer.from(await res.arrayBuffer());
}

function registerCatalogHandler(bot) {
  bot.on('document', async (ctx, next) => {
    const document = ctx.message.document;
    if (!isPdfDocument(document)) return next();

    if (!ctx.session?.token) {
      await ctx.reply('Сначала завершите регистрацию через /start, затем пришлите PDF-каталог ещё раз.');
      return;
    }

    if (USING_CLOUD_API && document.file_size && document.file_size > CLOUD_API_FILE_LIMIT_BYTES) {
      await ctx.reply(
        '⚠️ Файл больше 20 МБ — облачный Telegram Bot API не отдаёт боту такие файлы напрямую. ' +
          'Пришлите более лёгкую версию каталога (например, без картинок) либо попросите администратора ' +
          'бота подключить self-hosted Bot API сервер с флагом --local (см. README) — тогда лимит снимается.'
      );
      return;
    }

    if (document.file_size && document.file_size > MAX_UPLOAD_BYTES) {
      await ctx.reply(`⚠️ Файл больше ${config.maxPdfUploadMb} МБ — это больше, чем бот готов принять за раз.`);
      return;
    }

    try {
      await ctx.reply('🔄 Получил PDF-каталог, разбираю товары — это может занять около минуты...');

      const buffer = await fetchTelegramFileBuffer(ctx, document.file_id);

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
      if (!USING_CLOUD_API && /file is too big/i.test(err.message)) {
        await ctx.reply(
          '❌ Self-hosted Bot API сервер отклонил файл как слишком большой. Он снимает лимит в 20 МБ ' +
            'только с флагом --local (переменная TELEGRAM_LOCAL=1) — проверьте, что она включена ' +
            'на сервере telegram-bot-api, и что его volume расшарен с контейнером бота (см. README).'
        );
        return;
      }
      await ctx.reply(`❌ Не удалось обновить каталог: ${err.message}`);
    }
  });
}

module.exports = { registerCatalogHandler, isPdfDocument, fetchTelegramFileBuffer, CLOUD_API_FILE_LIMIT_BYTES, MAX_UPLOAD_BYTES };
