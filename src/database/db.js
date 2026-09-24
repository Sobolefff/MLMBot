const { initDatabase } = require('./init');

let db;

function getDb() {
  if (!db) {
    db = initDatabase();
  }
  return db;
}

module.exports = { getDb };
