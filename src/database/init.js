const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const config = require('../config');

// `CREATE TABLE IF NOT EXISTS` in schema.sql only helps on a fresh database -
// on one that already has a `products` table (any real deployment), adding a
// column there needs an explicit, idempotent migration so upgrading doesn't
// require anyone to touch the database by hand.
function migrateSchema(db) {
  const productColumns = db.prepare("PRAGMA table_info(products)").all();
  if (!productColumns.some((c) => c.name === 'product_url')) {
    db.exec('ALTER TABLE products ADD COLUMN product_url TEXT');
  }
}

function initDatabase() {
  const dbDir = path.dirname(config.sqlitePath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  const db = new Database(config.sqlitePath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  db.exec(schema);
  migrateSchema(db);

  return db;
}

if (require.main === module) {
  const db = initDatabase();
  console.log(`Database initialized at ${config.sqlitePath}`);
  db.close();
}

module.exports = { initDatabase };
