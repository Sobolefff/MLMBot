const os = require('os');
const path = require('path');
const fs = require('fs/promises');

const { isPdfDocument } = require('../../src/bot/handlers/catalog');

describe('isPdfDocument', () => {
  test('accepts a document with the PDF mime type', () => {
    expect(isPdfDocument({ mime_type: 'application/pdf', file_name: 'upload.bin' })).toBe(true);
  });

  test('accepts a .pdf filename even with a generic mime type', () => {
    expect(isPdfDocument({ mime_type: 'application/octet-stream', file_name: 'catalog.PDF' })).toBe(true);
  });

  test('rejects other documents', () => {
    expect(isPdfDocument({ mime_type: 'image/png', file_name: 'photo.png' })).toBe(false);
    expect(isPdfDocument(null)).toBe(false);
  });
});

describe('cloud vs self-hosted Bot API file handling', () => {
  const loadHandlerWithApiRoot = (telegramApiRoot) => {
    jest.resetModules();
    jest.doMock('../../src/config', () => ({
      telegramApiRoot,
      maxPdfUploadMb: 150,
    }));
    jest.doMock('../../src/bot/apiClient', () => ({ requestRaw: jest.fn().mockResolvedValue({ total: 1, categories: 1 }) }));
    return require('../../src/bot/handlers/catalog');
  };

  afterEach(() => {
    jest.dontMock('../../src/config');
    jest.dontMock('../../src/bot/apiClient');
  });

  test('on the cloud API, a 25MB file is refused before any download attempt', async () => {
    const { registerCatalogHandler } = loadHandlerWithApiRoot('https://api.telegram.org');
    const bot = { on: jest.fn() };
    registerCatalogHandler(bot);
    const handler = bot.on.mock.calls.find(([event]) => event === 'document')[1];

    const ctx = {
      session: { token: 't' },
      message: { document: { mime_type: 'application/pdf', file_name: 'c.pdf', file_size: 25 * 1024 * 1024 } },
      reply: jest.fn(),
      telegram: { getFile: jest.fn(), getFileLink: jest.fn() },
    };
    await handler(ctx, jest.fn());

    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('20 МБ'));
    expect(ctx.telegram.getFile).not.toHaveBeenCalled();
  });

  test('on a self-hosted API without --local, a size rejection from getFile gets a --local hint', async () => {
    const { registerCatalogHandler } = loadHandlerWithApiRoot('http://telegram-bot-api:8081');
    const bot = { on: jest.fn() };
    registerCatalogHandler(bot);
    const handler = bot.on.mock.calls.find(([event]) => event === 'document')[1];

    const ctx = {
      session: { token: 't' },
      message: { document: { mime_type: 'application/pdf', file_name: 'c.pdf', file_size: 25 * 1024 * 1024 } },
      reply: jest.fn(),
      telegram: { getFile: jest.fn().mockRejectedValue(new Error('400: Bad Request: file is too big')) },
    };
    await handler(ctx, jest.fn());

    expect(ctx.telegram.getFile).toHaveBeenCalled();
    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('--local'));
  });

  test('on a self-hosted --local server, a document.file_path over 20MB still goes through', async () => {
    const { registerCatalogHandler } = loadHandlerWithApiRoot('http://telegram-bot-api:8081');
    const bot = { on: jest.fn() };
    registerCatalogHandler(bot);
    const handler = bot.on.mock.calls.find(([event]) => event === 'document')[1];

    const localPath = path.join(os.tmpdir(), `catalog-${Date.now()}.pdf`);
    await fs.writeFile(localPath, '%PDF-fake-content');

    const ctx = {
      session: { token: 't' },
      message: { document: { mime_type: 'application/pdf', file_name: 'c.pdf', file_size: 25 * 1024 * 1024, file_id: 'abc' } },
      reply: jest.fn(),
      telegram: { getFile: jest.fn().mockResolvedValue({ file_path: localPath }) },
    };
    await handler(ctx, jest.fn());

    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('✅'));
    await fs.rm(localPath, { force: true });
  });
});

describe('fetchTelegramFileBuffer', () => {
  test('reads the file directly from disk when getFile returns an absolute path (--local mode)', async () => {
    jest.resetModules();
    jest.doMock('../../src/config', () => ({ telegramApiRoot: 'http://telegram-bot-api:8081', maxPdfUploadMb: 150 }));
    jest.doMock('../../src/bot/apiClient', () => ({ requestRaw: jest.fn() }));
    const { fetchTelegramFileBuffer } = require('../../src/bot/handlers/catalog');

    const localPath = path.join(os.tmpdir(), `catalog-direct-${Date.now()}.pdf`);
    await fs.writeFile(localPath, 'hello-pdf-bytes');
    const ctx = { telegram: { getFile: jest.fn().mockResolvedValue({ file_path: localPath }) } };

    const buffer = await fetchTelegramFileBuffer(ctx, 'file-id');

    expect(buffer.toString()).toBe('hello-pdf-bytes');
    await fs.rm(localPath, { force: true });
    jest.dontMock('../../src/config');
    jest.dontMock('../../src/bot/apiClient');
  });

  test('falls back to HTTP download when getFile returns a relative path (cloud/non-local mode)', async () => {
    jest.resetModules();
    jest.doMock('../../src/config', () => ({ telegramApiRoot: 'https://api.telegram.org', maxPdfUploadMb: 150 }));
    jest.doMock('../../src/bot/apiClient', () => ({ requestRaw: jest.fn() }));
    const { fetchTelegramFileBuffer } = require('../../src/bot/handlers/catalog');

    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockResolvedValue({ ok: true, arrayBuffer: async () => Buffer.from('remote-bytes') });
    const ctx = {
      telegram: {
        getFile: jest.fn().mockResolvedValue({ file_path: 'documents/file_1.pdf' }),
        getFileLink: jest.fn().mockResolvedValue(new URL('https://api.telegram.org/file/botX/documents/file_1.pdf')),
      },
    };

    const buffer = await fetchTelegramFileBuffer(ctx, 'file-id');

    expect(buffer.toString()).toBe('remote-bytes');
    expect(ctx.telegram.getFileLink).toHaveBeenCalled();
    global.fetch = originalFetch;
    jest.dontMock('../../src/config');
    jest.dontMock('../../src/bot/apiClient');
  });
});
