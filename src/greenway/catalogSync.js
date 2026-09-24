const { getDb } = require('../database/db');
const logger = require('../utils/logger');

/**
 * Maps greenway/shop/product/quick/ items onto our `products` table.
 * `stock_product.value` is PV (confirmed via recon 2026-09-24), `price` is
 * RUB, `brand.name` is used as the category, `can_order` maps to availability.
 */
function toProductRow(item) {
  const stock = item.stock_product || {};
  return {
    greenway_id: String(item.id),
    name: item.name,
    price: stock.price ?? 0,
    pv: stock.value ?? 0,
    category: item.brand?.name ?? null,
    image_url: null,
    is_available: stock.can_order ? 1 : 0,
  };
}

/**
 * Fetches the full Greenway product catalog via the given authenticated
 * client and upserts it into the local `products` table. Meant to run on a
 * schedule (see src/scheduler/catalogCron.js) using a service account's
 * token, since the catalog itself is the same for every partner.
 */
async function syncCatalog(client) {
  const { products = [] } = await client.getShopProducts();
  const db = getDb();

  const upsert = db.prepare(`
    INSERT INTO products (greenway_id, name, price, pv, category, image_url, last_updated, is_available)
    VALUES (@greenway_id, @name, @price, @pv, @category, @image_url, CURRENT_TIMESTAMP, @is_available)
    ON CONFLICT(greenway_id) DO UPDATE SET
      name = excluded.name,
      price = excluded.price,
      pv = excluded.pv,
      category = excluded.category,
      image_url = excluded.image_url,
      last_updated = CURRENT_TIMESTAMP,
      is_available = excluded.is_available
  `);

  const rows = products.filter((item) => item.id && item.name).map(toProductRow);
  const insertMany = db.transaction((items) => {
    for (const row of items) upsert.run(row);
  });
  insertMany(rows);

  logger.info(`Greenway catalog synced: ${rows.length} products upserted`);
  return rows.length;
}

module.exports = { syncCatalog, toProductRow };
