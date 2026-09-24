const fs = require('fs');
const path = require('path');
const os = require('os');

process.env.SQLITE_PATH = path.join(os.tmpdir(), `greenway-catalog-test-${Date.now()}.db`);

const { getDb } = require('../../src/database/db');
const { syncCatalog, toProductRow } = require('../../src/greenway/catalogSync');

afterAll(() => {
  getDb().close();
  fs.rmSync(process.env.SQLITE_PATH, { force: true });
  fs.rmSync(`${process.env.SQLITE_PATH}-wal`, { force: true });
  fs.rmSync(`${process.env.SQLITE_PATH}-shm`, { force: true });
});

const sampleProduct = {
  id: 4251,
  offer_id: 143943,
  name: 'Стартовый набор 50 PV health 18010',
  code: '18010',
  stock_product: { price: 6990, value: 50, can_order: true },
  brand: { id: 62, name: 'Спецпредложение для новичков' },
};

describe('toProductRow', () => {
  test('maps a Greenway shop item onto our products schema', () => {
    const row = toProductRow(sampleProduct);
    expect(row).toEqual({
      greenway_id: '4251',
      name: 'Стартовый набор 50 PV health 18010',
      price: 6990,
      pv: 50,
      category: 'Спецпредложение для новичков',
      image_url: null,
      is_available: 1,
    });
  });

  test('maps can_order: false to is_available: 0', () => {
    const row = toProductRow({ ...sampleProduct, stock_product: { ...sampleProduct.stock_product, can_order: false } });
    expect(row.is_available).toBe(0);
  });

  test('defaults missing brand/price/value gracefully', () => {
    const row = toProductRow({ id: 1, name: 'No stock info' });
    expect(row).toEqual({
      greenway_id: '1',
      name: 'No stock info',
      price: 0,
      pv: 0,
      category: null,
      image_url: null,
      is_available: 0,
    });
  });
});

describe('syncCatalog', () => {
  test('upserts products from a mocked client', async () => {
    const client = { getShopProducts: jest.fn().mockResolvedValue({ products: [sampleProduct] }) };

    const count = await syncCatalog(client);

    expect(count).toBe(1);
    const db = getDb();
    const stored = db.prepare('SELECT * FROM products WHERE greenway_id = ?').get('4251');
    expect(stored.name).toBe(sampleProduct.name);
    expect(stored.price).toBe(6990);
    expect(stored.pv).toBe(50);
    expect(stored.is_available).toBe(1);
  });

  test('updates existing rows on re-sync (price change)', async () => {
    const clientV1 = { getShopProducts: jest.fn().mockResolvedValue({ products: [sampleProduct] }) };
    await syncCatalog(clientV1);

    const updated = { ...sampleProduct, stock_product: { ...sampleProduct.stock_product, price: 5990 } };
    const clientV2 = { getShopProducts: jest.fn().mockResolvedValue({ products: [updated] }) };
    await syncCatalog(clientV2);

    const db = getDb();
    const rows = db.prepare('SELECT * FROM products WHERE greenway_id = ?').all('4251');
    expect(rows.length).toBe(1);
    expect(rows[0].price).toBe(5990);
  });

  test('skips items without id or name', async () => {
    const client = {
      getShopProducts: jest.fn().mockResolvedValue({
        products: [{ id: null, name: 'Missing id' }, { id: 999, name: null }],
      }),
    };
    const count = await syncCatalog(client);
    expect(count).toBe(0);
  });
});
