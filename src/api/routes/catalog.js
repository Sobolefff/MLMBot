const express = require('express');
const rateLimit = require('express-rate-limit');
const { requireAuth } = require('../middleware/auth');
const { logAudit } = require('../../utils/audit');
const { syncFromPdfBuffer } = require('../../catalog/pdfCatalogSync');
const logger = require('../../utils/logger');

const router = express.Router();

// Parsing a ~200-page PDF is the heaviest write endpoint in the API and
// touches the shared product catalog - keep it rare.
const importLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Слишком много запросов. Повторите позже.' },
});

router.post(
  '/import-pdf',
  importLimiter,
  requireAuth,
  express.raw({ type: 'application/pdf', limit: '25mb' }),
  async (req, res) => {
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
      return res.status(400).json({ error: 'Ожидался файл PDF в теле запроса (Content-Type: application/pdf)' });
    }
    try {
      const result = await syncFromPdfBuffer(req.body);
      logAudit({
        userId: req.auth.partner_id,
        userType: 'partner',
        action: 'import_pdf_catalog',
        entity: 'products',
        details: result,
      });
      res.json(result);
    } catch (err) {
      logger.error('PDF catalog import failed', { error: err.message });
      res.status(400).json({ error: err.message });
    }
  }
);

module.exports = router;
