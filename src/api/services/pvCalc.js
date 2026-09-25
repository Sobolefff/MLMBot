const DEFAULT_MAX_ITEMS = 10;
const PV_TOLERANCE_RATIO = 0.25;
const PV_TOLERANCE_MIN = 20;

/**
 * Unbounded knapsack: for each item count budget k (1..maxItems), find the
 * cheapest way to reach at least `pvMax` total PV using up to k picks with
 * repetition allowed. Layers depend only on the previous layer, so the same
 * product can be reused across different picks (that's what makes it unbounded).
 */
function buildDp(products, pvMax, maxItems) {
  const INF = Infinity;
  // dp[k][pv] = { price, prodIdx, prevPv } — min price to reach exactly `pv` PV using exactly k picks
  const dp = new Array(maxItems + 1);
  dp[0] = new Array(pvMax + 1).fill(null).map(() => ({ price: INF, prodIdx: -1, prevPv: -1 }));
  dp[0][0] = { price: 0, prodIdx: -1, prevPv: -1 };

  for (let k = 1; k <= maxItems; k++) {
    dp[k] = new Array(pvMax + 1).fill(null).map(() => ({ price: INF, prodIdx: -1, prevPv: -1 }));
    for (let pv = 0; pv <= pvMax; pv++) {
      // carry forward: don't spend the k-th pick
      if (dp[k - 1][pv].price < dp[k][pv].price) {
        dp[k][pv] = { price: dp[k - 1][pv].price, prodIdx: -1, prevPv: pv, carry: true };
      }
      for (let i = 0; i < products.length; i++) {
        const item = products[i];
        // Products carry fractional PV (e.g. 3.2 from the PDF catalog import -
        // pyapi's catalog happened to always be whole numbers, so this went
        // unnoticed until then). The DP table is indexed by PV, so a
        // fractional value here would look up a non-existent array slot and
        // read `.price` off `undefined`. Round only for indexing - the real
        // (unrounded) PV is still what gets reported back in reconstruct().
        const prevPv = pv - Math.round(item.pv);
        if (prevPv < 0) continue;
        const candidatePrice = dp[k - 1][prevPv].price + item.price;
        if (candidatePrice < dp[k][pv].price) {
          dp[k][pv] = { price: candidatePrice, prodIdx: i, prevPv, carry: false };
        }
      }
    }
  }
  return dp;
}

function reconstruct(dp, products, k, pv) {
  const counts = new Map();
  let curK = k;
  let curPv = pv;
  while (curK > 0) {
    const cell = dp[curK][curPv];
    if (cell.price === Infinity) break;
    if (!cell.carry && cell.prodIdx >= 0) {
      counts.set(cell.prodIdx, (counts.get(cell.prodIdx) || 0) + 1);
    }
    curPv = cell.prevPv;
    curK -= 1;
  }
  const items = [];
  let totalPv = 0;
  let totalPrice = 0;
  for (const [idx, quantity] of counts.entries()) {
    const p = products[idx];
    items.push({
      product_id: p.id ?? p.greenway_id ?? idx,
      name: p.name,
      pv: p.pv,
      price: p.price,
      quantity,
      product_url: p.product_url ?? null,
    });
    totalPv += p.pv * quantity;
    totalPrice += p.price * quantity;
  }
  items.sort((a, b) => b.price - a.price);
  return { totalPv, totalPrice, items };
}

/**
 * Finds the cheapest combination reaching at least targetPv, searching across
 * all item-count budgets and all pv values within tolerance of the target.
 */
function findBestForTarget(products, targetPv, maxItems, pvMax) {
  const dp = buildDp(products, pvMax, maxItems);
  let best = null;
  for (let k = 1; k <= maxItems; k++) {
    for (let pv = targetPv; pv <= pvMax; pv++) {
      const price = dp[k][pv].price;
      if (price === Infinity) continue;
      if (!best || price < best.price || (price === best.price && pv < best.pv)) {
        best = { price, pv, k };
      }
    }
  }
  if (!best) return null;
  const { totalPv, totalPrice, items } = reconstruct(dp, products, best.k, best.pv);
  return { total_pv: totalPv, total_price: totalPrice, items };
}

function dominantProductIndex(result, products) {
  if (!result || result.items.length === 0) return -1;
  const top = [...result.items].sort((a, b) => b.quantity - a.quantity)[0];
  return products.findIndex((p) => (p.id ?? p.greenway_id) === top.product_id);
}

/**
 * Finds up to 3 diverse combinations of products reaching (>=) a target PV,
 * minimizing total price, subject to a max item count. Excluded categories
 * are filtered out before the search. Runs in well under 500ms for typical
 * catalog sizes (~100-300 products, pv target <= a few hundred).
 */
function searchByTargetPv(allProducts, { targetPv, maxItems = DEFAULT_MAX_ITEMS, excludedCategories = [] }) {
  if (!targetPv || targetPv <= 0) {
    throw new Error('targetPv must be a positive number');
  }
  // The DP table below is indexed by PV, so it needs an integer target
  // (a fractional pvMax would make `new Array(pvMax + 1)` throw).
  targetPv = Math.round(targetPv);
  const products = allProducts.filter(
    (p) => p.is_available !== 0 && !excludedCategories.includes(p.category)
  );
  if (products.length === 0) return { results: [] };

  const tolerance = Math.max(PV_TOLERANCE_MIN, Math.round(targetPv * PV_TOLERANCE_RATIO));
  const pvMax = targetPv + tolerance;

  const results = [];
  let pool = [...products];
  for (let attempt = 0; attempt < 3 && pool.length > 0; attempt++) {
    const found = findBestForTarget(pool, targetPv, maxItems, pvMax);
    if (!found) break;
    const isDuplicate = results.some(
      (r) => r.total_pv === found.total_pv && r.total_price === found.total_price
    );
    if (!isDuplicate) {
      results.push({ id: `combo_${results.length + 1}`, ...found });
    }
    const dropIdx = dominantProductIndex(found, pool);
    if (dropIdx === -1) break;
    pool = pool.filter((_, idx) => idx !== dropIdx);
  }

  return { results };
}

/**
 * Finds the combination that maximizes total PV without exceeding a target price.
 */
function findMaxPvUnderBudget(products, budget, maxItems) {
  const dp = new Array(maxItems + 1);
  const INF = Infinity;
  dp[0] = new Array(budget + 1).fill(null).map(() => ({ pv: 0, prodIdx: -1, prevPrice: -1, carry: false }));
  for (let k = 1; k <= maxItems; k++) {
    dp[k] = new Array(budget + 1).fill(null).map(() => ({ pv: -INF, prodIdx: -1, prevPrice: -1, carry: false }));
    for (let price = 0; price <= budget; price++) {
      if (dp[k - 1][price].pv > dp[k][price].pv) {
        dp[k][price] = { pv: dp[k - 1][price].pv, prodIdx: -1, prevPrice: price, carry: true };
      }
      for (let i = 0; i < products.length; i++) {
        const item = products[i];
        const roundedPrice = Math.round(item.price);
        const prevPrice = price - roundedPrice;
        if (prevPrice < 0) continue;
        const candidatePv = dp[k - 1][prevPrice].pv + item.pv;
        if (candidatePv > dp[k][price].pv) {
          dp[k][price] = { pv: candidatePv, prodIdx: i, prevPrice, carry: false };
        }
      }
    }
  }

  let best = null;
  for (let k = 1; k <= maxItems; k++) {
    for (let price = 0; price <= budget; price++) {
      const pv = dp[k][price].pv;
      if (pv === -Infinity) continue;
      if (!best || pv > best.pv) {
        best = { pv, price, k };
      }
    }
  }
  if (!best) return null;

  const counts = new Map();
  let curK = best.k;
  let curPrice = best.price;
  while (curK > 0) {
    const cell = dp[curK][curPrice];
    if (cell.pv === -Infinity) break;
    if (!cell.carry && cell.prodIdx >= 0) {
      counts.set(cell.prodIdx, (counts.get(cell.prodIdx) || 0) + 1);
    }
    curPrice = cell.prevPrice;
    curK -= 1;
  }
  const items = [];
  let totalPv = 0;
  let totalPrice = 0;
  for (const [idx, quantity] of counts.entries()) {
    const p = products[idx];
    items.push({
      product_id: p.id ?? p.greenway_id ?? idx,
      name: p.name,
      pv: p.pv,
      price: p.price,
      quantity,
      product_url: p.product_url ?? null,
    });
    totalPv += p.pv * quantity;
    totalPrice += p.price * quantity;
  }
  items.sort((a, b) => b.price - a.price);
  return { total_pv: totalPv, total_price: totalPrice, items };
}

function search(allProducts, options) {
  const { target_pv, target_price, max_items, excluded_categories } = options;
  if (target_pv) {
    return searchByTargetPv(allProducts, {
      targetPv: target_pv,
      maxItems: max_items,
      excludedCategories: excluded_categories || [],
    });
  }
  if (target_price) {
    const result = findMaxPvUnderBudget(
      allProducts.filter((p) => p.is_available !== 0 && !(excluded_categories || []).includes(p.category)),
      Math.round(target_price),
      max_items || DEFAULT_MAX_ITEMS
    );
    return { results: result ? [{ id: 'combo_1', ...result }] : [] };
  }
  throw new Error('Either target_pv or target_price must be provided');
}

module.exports = { search, searchByTargetPv, findMaxPvUnderBudget };
