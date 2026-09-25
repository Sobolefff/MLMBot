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
  // Parallel to `records` (same index) - which column the card is in and the
  // y-coordinate of its name line, i.e. the top of its printed "card". Used
  // by matchProductLinks to work out where one card ends and the next
  // begins, without changing the shape of `records` itself (kept separate
  // so existing callers/tests that check `records` verbatim are unaffected).
  const positions = [];
  const incomplete = [];
  let category = startCategory || null;

  for (const it of items) {
    if (classifyFontRole(it.font, it.height) === 'category') category = it.text;
  }

  const half = pageWidth / 2;
  const columns = [
    { side: 'left', items: items.filter((it) => it.x < half) },
    { side: 'right', items: items.filter((it) => it.x >= half) },
  ];

  for (const col of columns) {
    const sorted = [...col.items].sort((a, b) => b.y - a.y || a.x - b.x);
    let rec = null;
    let recTopY = null;

    const flush = () => {
      if (!rec) return;
      if (rec.name && rec.priceRub != null && rec.pv != null) {
        records.push({ name: rec.name.trim(), codes: rec.codes, price: rec.priceRub, pv: rec.pv, category });
        positions.push({ side: col.side, topY: recTopY });
      } else if (rec.name) {
        incomplete.push(rec.name);
      }
      rec = null;
      recTopY = null;
    };

    for (const it of sorted) {
      const role = classifyFontRole(it.font, it.height);

      if (role === 'name') {
        if (!rec) {
          rec = { name: it.text, codes: [], priceRub: null, pv: null };
          recTopY = it.y;
        } else if (rec.priceRub != null) {
          flush();
          rec = { name: it.text, codes: [], priceRub: null, pv: null };
          recTopY = it.y;
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

  return { records, category, incomplete, positions };
}

/**
 * Assigns each product card the (best-guess) URL of its page on
 * greenwayglobal.com, by matching each PDF link annotation's rectangle to
 * whichever card's vertical band it falls in - link annotations don't carry
 * any structured reference back to "this is product X", only a clickable
 * screen region, so position is the only signal available.
 *
 * A card's band runs from its own name line down to the next card's name
 * line in the same column (or to the bottom of the page for the last card).
 * Some cards get more than one link (e.g. two-fragrance perfume cards have
 * one link per fragrance row); when several links land in the same band,
 * the largest one is kept as "the" link for that card - precision beyond
 * "a valid link to view this product" isn't needed here.
 */
function matchProductLinks(records, positions, links, pageWidth) {
  const urls = new Array(records.length).fill(null);
  const half = pageWidth / 2;

  for (const side of ['left', 'right']) {
    const indices = [];
    positions.forEach((pos, idx) => {
      if (pos.side === side) indices.push(idx);
    });
    if (indices.length === 0) continue;

    const sideLinks = links.filter((l) => (side === 'left' ? l.rect[0] < half : l.rect[0] >= half));
    const bestArea = new Array(indices.length).fill(-1);

    for (const link of sideLinks) {
      const linkTop = Math.max(link.rect[1], link.rect[3]);
      // Topmost card whose name line is at or above this link's top edge
      // (small tolerance for the link sitting just above the text).
      let bandIdx = -1;
      for (let i = 0; i < indices.length; i++) {
        if (positions[indices[i]].topY <= linkTop + 5) {
          bandIdx = i;
          break;
        }
      }
      if (bandIdx === -1) continue;

      const area = Math.abs(link.rect[2] - link.rect[0]) * Math.abs(link.rect[3] - link.rect[1]);
      if (area > bestArea[bandIdx]) {
        bestArea[bandIdx] = area;
        urls[indices[bandIdx]] = link.url;
      }
    }
  }

  return urls;
}

/**
 * Parses the whole PDF buffer into raw product cards (one per printed card;
 * a card with several SKU codes still yields a single record with a
 * `codes` array - see normalizeRecords for the per-SKU expansion).
 */
// Every page repeats a generic link back to the homepage (logo/header) -
// not useful as a "view this product" link, so it's excluded before matching.
const HOMEPAGE_LINK_RE = /^https?:\/\/greenwayglobal\.com\/?$/;

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

      const annotations = await page.getAnnotations();
      const links = annotations.filter((a) => a.subtype === 'Link' && a.url && !HOMEPAGE_LINK_RE.test(a.url));
      const urls = matchProductLinks(result.records, result.positions, links, viewport.width);

      result.records.forEach((rec, i) => records.push({ ...rec, url: urls[i] }));
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
    const product_url = r.url ?? null;
    if (r.codes.length === 0) {
      const hash = crypto.createHash('md5').update(r.name).digest('hex').slice(0, 12);
      rows.push({ greenway_id: `pdf-x-${hash}`, name: r.name, price: r.price, pv: r.pv, category: r.category, product_url });
      continue;
    }
    for (const code of r.codes) {
      rows.push({ greenway_id: `pdf-${code}`, name: r.name, price: r.price, pv: r.pv, category: r.category, product_url });
    }
  }
  return rows;
}

module.exports = {
  classifyFontRole,
  buildRecordsFromItems,
  matchProductLinks,
  parsePdfCatalogBuffer,
  normalizeRecords,
};
