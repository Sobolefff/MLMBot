const fs = require('fs');
const path = require('path');
const os = require('os');
const Database = require('better-sqlite3');

describe('initDatabase migration', () => {
  let dbPath;

  beforeEach(() => {
    dbPath = path.join(os.tmpdir(), `greenway-migration-test-${Date.now()}-${Math.random()}.db`);
    process.env.SQLITE_PATH = dbPath;
    jest.resetModules();
  });

  afterEach(() => {
    fs.rmSync(dbPath, { force: true });
    fs.rmSync(`${dbPath}-wal`, { force: true });
    fs.rmSync(`${dbPath}-shm`, { force: true });
  });

  test('adds product_url to a products table that predates the column, without losing existing rows', () => {
    // Simulate a real deployment's database as it was before this change:
    // a `products` table with no `product_url` column, holding real data.
    const preExisting = new Database(dbPath);
    preExisting.exec(`
      CREATE TABLE products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        greenway_id TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        price REAL NOT NULL,
        pv INTEGER NOT NULL,
        category TEXT
      )
    `);
    preExisting.prepare('INSERT INTO products (greenway_id, name, price, pv, category) VALUES (?, ?, ?, ?, ?)').run(
      'pdf-06001',
      'Файбер для мытья посуды',
      440,
      3.2,
      'GREEN FIBER HOME'
    );
    preExisting.close();

    const { initDatabase } = require('../../src/database/init');
    const db = initDatabase();

    const columns = db.prepare('PRAGMA table_info(products)').all();
    expect(columns.some((c) => c.name === 'product_url')).toBe(true);

    const row = db.prepare('SELECT * FROM products WHERE greenway_id = ?').get('pdf-06001');
    expect(row.name).toBe('Файбер для мытья посуды');
    expect(row.product_url).toBeNull();

    db.close();
  });

  test('is idempotent - running it twice does not error or duplicate the column', () => {
    const { initDatabase } = require('../../src/database/init');
    const db1 = initDatabase();
    db1.close();
    jest.resetModules();
    const db2 = require('../../src/database/init').initDatabase();
    const columns = db2.prepare('PRAGMA table_info(products)').all().filter((c) => c.name === 'product_url');
    expect(columns).toHaveLength(1);
    db2.close();
  });
});
