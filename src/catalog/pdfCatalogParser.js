const crypto = require('crypto');

// The PDF catalog is a two-column glossy brochure (see greenwayglobal.com
// export). It has no tagged structure/tables — the only reliable anchors are
// typographic: each product card uses a distinct font weight per role
// (confirmed by inspecting the embedded font names via pdfjs-dist):
//   Noah-ExtraBold  -> product name (may span 2-3 lines)
//   Noah-Bold       -> size/quantity line, sometimes with the SKU appended
//   Noah-Light      -> marketing description text (ignored)
//   Noah-Medium     -> SKU codes ("#01234", 5.5pt) and the price/PV line (11pt)
//   Noah-Regular    -> running per-page category header, nav link, footer
const CODE_RE = /#(\d+)/g;
const FULL_PRICE_RE = /([\d\s ]+)\s*₽\s*([\d,.]+)\s*PV/;
const PRICE_ONLY_RE = /^\s*([\d\s ]+)\s*₽\s*$/;
const PV_ONLY_RE = /^\s*([\d,.]+)\s*PV\s*$/;

function classifyFontRole(fontName, height) {
  const family = String(fontName || '').split('+').pop();
  if (family === 'Noah-ExtraBold' && height >= 7 && height <= 9) return 'name';
  if (family === 'Noah-Regular' && height >= 9 && height <= 11) return 'category';
  return 'other';
}

/**
 * Reconstructs product cards from a flat list of positioned text items
 * belonging to a single page. Items are pdfjs-dist text-content items
 * enriched with the resolved font family name: { text, x, y, height, font }.
 *
 * The brochure has no real reading-order guarantee in the underlying content
 * stream (same-style runs get batched together), so items are grouped by
 * horizontal half (matches this catalog's two-column layout, single-column
 * pages simply leave one half empty) and sorted top-to-bottom within each
 * half using their y coordinate.
 */
function buildRecordsFromItems(items, pageWidth, startCategory) {
  const records = [];
  const incomplete = [];
  let category = startCategory || null;

  for (const it of items) {
    if (classifyFontRole(it.font, it.height) === 'category') category = it.text;
  }

  const half = pageWidth / 2;
  const columns = [items.filter((it) => it.x < half), items.filter((it) => it.x >= half)];

  for (const col of columns) {
    const sorted = [...col].sort((a, b) => b.y - a.y || a.x - b.x);
    let rec = null;

    const flush = () => {
      if (!rec) return;
      if (rec.name && rec.priceRub != null && rec.pv != null) {
        records.push({ name: rec.name.trim(), codes: rec.codes, price: rec.priceRub, pv: rec.pv, category });
      } else if (rec.name) {
        incomplete.push(rec.name);
      }
      rec = null;
    };

    for (const it of sorted) {
      const role = classifyFontRole(it.font, it.height);

      if (role === 'name') {
        if (!rec) {
          rec = { name: it.text, codes: [], priceRub: null, pv: null };
        } else if (rec.priceRub != null) {
          flush();
          rec = { name: it.text, codes: [], priceRub: null, pv: null };
        } else if (rec.codes.length === 0) {
          rec.name += ' ' + it.text; // multi-line title continuation
        }
        // else: a variant sub-label between SKU codes and the shared price
        // line (e.g. flavours/scents sharing one base product+price) - drop it
        continue;
      }

      if (!rec) continue; // text before the first product name in this column

      let m;
      CODE_RE.lastIndex = 0;
      while ((m = CODE_RE.exec(it.text))) rec.codes.push(m[1]);

      const full = FULL_PRICE_RE.exec(it.text);
      if (full) {
        rec.priceRub = parseFloat(full[1].replace(/[\s ]/g, ''));
        rec.pv = parseFloat(full[2].replace(',', '.'));
        flush();
        continue;
      }
      const priceOnly = PRICE_ONLY_RE.exec(it.text);
      if (priceOnly) {
        rec.priceRub = parseFloat(priceOnly[1].replace(/[\s ]/g, ''));
        continue;
      }
      const pvOnly = PV_ONLY_RE.exec(it.text);
      if (pvOnly) {
        rec.pv = parseFloat(pvOnly[1].replace(',', '.'));
        if (rec.priceRub != null) flush();
        continue;
      }
    }
    flush();
  }

  return { records, category, incomplete };
}

/**
 * Parses the whole PDF buffer into raw product cards (one per printed card;
 * a card with several SKU codes still yields a single record with a
 * `codes` array - see normalizeRecords for the per-SKU expansion).
 */
async function parsePdfCatalogBuffer(buffer) {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await getDocument({ data: new Uint8Array(buffer) }).promise;

  const records = [];
  let category = null;

  try {
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      await page.getOperatorList(); // resolves embedded font descriptors
      const content = await page.getTextContent();
      const viewport = page.getViewport({ scale: 1 });
      const commonObjs = page.commonObjs;

      const items = [];
      for (const raw of content.items) {
        const text = (raw.str || '').trim();
        if (!text) continue;
        let fontObj;
        try {
          fontObj = commonObjs.get(raw.fontName);
        } catch (e) {
          fontObj = null;
        }
        items.push({
          text,
          x: raw.transform[4],
          y: raw.transform[5],
          height: raw.height,
          font: fontObj ? fontObj.name : raw.fontName,
        });
      }

      const result = buildRecordsFromItems(items, viewport.width, category);
      category = result.category;
      records.push(...result.records);
      page.cleanup();
    }
  } finally {
    await doc.destroy();
  }

  return records;
}

/**
 * Expands raw catalog cards into one row per SKU (matches how a partner
 * actually orders - a specific article number/colour), ready for upserting
 * into the `products` table. Cards without any printed SKU (rare - a
 * handful of bundles/sets in this catalog) get a stable id derived from
 * their name, so re-imports stay idempotent.
 */
function normalizeRecords(records) {
  const rows = [];
  for (const r of records) {
    if (r.codes.length === 0) {
      const hash = crypto.createHash('md5').update(r.name).digest('hex').slice(0, 12);
      rows.push({ greenway_id: `pdf-x-${hash}`, name: r.name, price: r.price, pv: r.pv, category: r.category });
      continue;
    }
    for (const code of r.codes) {
      rows.push({ greenway_id: `pdf-${code}`, name: r.name, price: r.price, pv: r.pv, category: r.category });
    }
  }
  return rows;
}

module.exports = { classifyFontRole, buildRecordsFromItems, parsePdfCatalogBuffer, normalizeRecords };
