const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const config = require('../config');

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

  return db;
}

if (require.main === module) {
  const db = initDatabase();
  console.log(`Database initialized at ${config.sqlitePath}`);
  db.close();
}

module.exports = { initDatabase };
