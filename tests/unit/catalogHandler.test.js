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

describe('cloud vs self-hosted Bot API file-size gate', () => {
  const loadHandlerWithApiRoot = (telegramApiRoot) => {
    jest.resetModules();
    jest.doMock('../../src/config', () => ({
      telegramApiRoot,
      maxPdfUploadMb: 150,
    }));
    jest.doMock('../../src/bot/apiClient', () => ({ requestRaw: jest.fn() }));
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
      telegram: { getFileLink: jest.fn() },
    };
    await handler(ctx, jest.fn());

    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('20 МБ'));
    expect(ctx.telegram.getFileLink).not.toHaveBeenCalled();
  });

  test('on a self-hosted API, the same 25MB file is allowed through', async () => {
    const { registerCatalogHandler } = loadHandlerWithApiRoot('http://telegram-bot-api:8081');
    const bot = { on: jest.fn() };
    registerCatalogHandler(bot);
    const handler = bot.on.mock.calls.find(([event]) => event === 'document')[1];

    const ctx = {
      session: { token: 't' },
      message: { document: { mime_type: 'application/pdf', file_name: 'c.pdf', file_size: 25 * 1024 * 1024 } },
      reply: jest.fn(),
      telegram: { getFileLink: jest.fn().mockRejectedValue(new Error('stop here')) },
    };
    await handler(ctx, jest.fn());

    expect(ctx.telegram.getFileLink).toHaveBeenCalled();
    expect(ctx.reply.mock.calls.some(([msg]) => msg.includes('20 МБ'))).toBe(false);
  });
});
