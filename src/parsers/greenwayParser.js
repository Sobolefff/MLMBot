const { chromium } = require('playwright');
const config = require('../config');
const { getDb } = require('../database/db');
const logger = require('../utils/logger');

/**
 * Parses the Greenway catalog page and upserts products into the local DB.
 * The selectors below are placeholders — adjust them once the actual
 * catalog page markup is confirmed.
 */
async function parseCatalog(catalogUrl = config.greenwayCatalogUrl) {
  if (!catalogUrl) {
    throw new Error('GREENWAY_CATALOG_URL is not configured');
  }

  const browser = await chromium.launch();
  const db = getDb();
  let count = 0;

  try {
    const page = await browser.newPage();
    await page.goto(catalogUrl, { waitUntil: 'networkidle' });

    const products = await page.$$eval('[data-product-card]', (cards) =>
      cards.map((card) => ({
        greenway_id: card.getAttribute('data-product-id'),
        name: card.querySelector('[data-product-name]')?.textContent?.trim(),
        price: parseFloat(card.querySelector('[data-product-price]')?.textContent?.replace(/[^\d.]/g, '')),
        pv: parseFloat(card.querySelector('[data-product-pv]')?.textContent?.replace(/[^\d.]/g, '')),
        category: card.getAttribute('data-product-category'),
        image_url: card.querySelector('img')?.src,
      }))
    );

    const upsert = db.prepare(`
      INSERT INTO products (greenway_id, name, price, pv, category, image_url, last_updated)
      VALUES (@greenway_id, @name, @price, @pv, @category, @image_url, CURRENT_TIMESTAMP)
      ON CONFLICT(greenway_id) DO UPDATE SET
        name = excluded.name,
        price = excluded.price,
        pv = excluded.pv,
        category = excluded.category,
        image_url = excluded.image_url,
        last_updated = CURRENT_TIMESTAMP
    `);

    const insertMany = db.transaction((rows) => {
      for (const row of rows) {
        if (!row.greenway_id || !row.name) continue;
        upsert.run(row);
        count += 1;
      }
    });
    insertMany(products);

    logger.info(`Greenway catalog parsed: ${count} products upserted`);
    return count;
  } finally {
    await browser.close();
  }
}

if (require.main === module) {
  parseCatalog()
    .then((count) => {
      console.log(`Parsed ${count} products`);
      process.exit(0);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

module.exports = { parseCatalog };
