const fs = require('fs');
const path = require('path');
const os = require('os');

process.env.SQLITE_PATH = path.join(os.tmpdir(), `greenway-pdf-catalog-test-${Date.now()}.db`);

jest.mock('../../src/catalog/pdfCatalogParser', () => ({
  parsePdfCatalogBuffer: jest.fn(),
  normalizeRecords: jest.requireActual('../../src/catalog/pdfCatalogParser').normalizeRecords,
}));

const { getDb } = require('../../src/database/db');
const { parsePdfCatalogBuffer } = require('../../src/catalog/pdfCatalogParser');
const { syncFromPdfBuffer, MIN_PRODUCTS } = require('../../src/catalog/pdfCatalogSync');

afterAll(() => {
  getDb().close();
  fs.rmSync(process.env.SQLITE_PATH, { force: true });
  fs.rmSync(`${process.env.SQLITE_PATH}-wal`, { force: true });
  fs.rmSync(`${process.env.SQLITE_PATH}-shm`, { force: true });
});

function fakeCards(count) {
  return Array.from({ length: count }, (_, i) => ({
    name: `Товар ${i}`,
    codes: [String(10000 + i)],
    price: 100 + i,
    pv: 1,
    category: 'Тест',
  }));
}

describe('syncFromPdfBuffer', () => {
  test('refuses a PDF that yields suspiciously few products', async () => {
    parsePdfCatalogBuffer.mockResolvedValue(fakeCards(MIN_PRODUCTS - 1));
    await expect(syncFromPdfBuffer(Buffer.from('%PDF'))).rejects.toThrow(/слишком мало товаров/i);

    const db = getDb();
    const count = db.prepare("SELECT COUNT(*) AS c FROM products WHERE greenway_id LIKE 'pdf-%'").get().c;
    expect(count).toBe(0);
  });

  test('upserts a valid catalog and reports totals', async () => {
    parsePdfCatalogBuffer.mockResolvedValue(fakeCards(MIN_PRODUCTS));
    const result = await syncFromPdfBuffer(Buffer.from('%PDF'));

    expect(result.total).toBe(MIN_PRODUCTS);
    expect(result.categories).toBe(1);

    const db = getDb();
    const stored = db.prepare('SELECT * FROM products WHERE greenway_id = ?').get('pdf-10000');
    expect(stored.name).toBe('Товар 0');
    expect(stored.price).toBe(100);
    expect(stored.is_available).toBe(1);
  });

  test('re-import updates existing rows instead of duplicating them', async () => {
    parsePdfCatalogBuffer.mockResolvedValue(fakeCards(MIN_PRODUCTS));
    await syncFromPdfBuffer(Buffer.from('%PDF'));

    const updated = fakeCards(MIN_PRODUCTS).map((c) => ({ ...c, price: c.price + 1000 }));
    parsePdfCatalogBuffer.mockResolvedValue(updated);
    await syncFromPdfBuffer(Buffer.from('%PDF'));

    const db = getDb();
    const rows = db.prepare('SELECT * FROM products WHERE greenway_id = ?').all('pdf-10000');
    expect(rows).toHaveLength(1);
    expect(rows[0].price).toBe(1100);
  });

  test('does not collide with pyapi-sourced products sharing a numeric id', async () => {
    const db = getDb();
    db.prepare(
      `INSERT INTO products (greenway_id, name, price, pv, category) VALUES ('10000', 'Из pyapi', 1, 1, 'X')`
    ).run();

    parsePdfCatalogBuffer.mockResolvedValue(fakeCards(MIN_PRODUCTS));
    await syncFromPdfBuffer(Buffer.from('%PDF'));

    expect(db.prepare("SELECT name FROM products WHERE greenway_id = '10000'").get().name).toBe('Из pyapi');
    expect(db.prepare("SELECT name FROM products WHERE greenway_id = 'pdf-10000'").get().name).toBe('Товар 0');
  });
});
