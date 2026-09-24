const { runCatalogSync } = require('../scheduler/catalogCron');

runCatalogSync()
  .then((count) => {
    console.log(`Synced ${count} products from Greenway catalog.`);
    process.exit(0);
  })
  .catch((err) => {
    console.error('Catalog sync failed:', err.message);
    process.exit(1);
  });
