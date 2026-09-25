const { getDb } = require('../database/db');
const logger = require('../utils/logger');
const { parsePdfCatalogBuffer, normalizeRecords } = require('./pdfCatalogParser');

// Below this, the upload is almost certainly the wrong file (or a PDF the
// parser couldn't read at all) - refuse rather than silently gutting the
// shared product catalog for every partner.
const MIN_PRODUCTS = 30;

/**
 * Parses a partner-uploaded PDF catalog and upserts it into the shared
 * `products` table, keyed by `pdf-<sku>` (or `pdf-x-<hash>` for the rare
 * card printed without a SKU) so it never collides with pyapi-sourced rows.
 */
async function syncFromPdfBuffer(buffer) {
  const records = await parsePdfCatalogBuffer(buffer);
  const rows = normalizeRecords(records);

  if (rows.length < MIN_PRODUCTS) {
    throw new Error(
      `В файле распознано слишком мало товаров (${rows.length}). Похоже, это не каталог Greenway — база не обновлена.`
    );
  }

  const db = getDb();
  const upsert = db.prepare(`
    INSERT INTO products (greenway_id, name, price, pv, category, image_url, product_url, last_updated, is_available)
    VALUES (@greenway_id, @name, @price, @pv, @category, NULL, @product_url, CURRENT_TIMESTAMP, 1)
    ON CONFLICT(greenway_id) DO UPDATE SET
      name = excluded.name,
      price = excluded.price,
      pv = excluded.pv,
      category = excluded.category,
      product_url = excluded.product_url,
      last_updated = CURRENT_TIMESTAMP,
      is_available = 1
  `);
  const insertMany = db.transaction((items) => {
    for (const row of items) upsert.run(row);
  });
  insertMany(rows);

  const categories = new Set(rows.map((r) => r.category).filter(Boolean)).size;
  logger.info(`PDF catalog synced: ${rows.length} SKUs upserted across ${categories} categories`);
  return { total: rows.length, categories };
}

module.exports = { syncFromPdfBuffer, MIN_PRODUCTS };
