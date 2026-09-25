const { search } = require('../../src/api/services/pvCalc');

const products = [
  { id: 1, name: 'Крем для лица', price: 799, pv: 24, category: 'skincare', is_available: 1 },
  { id: 2, name: 'Витамины Plus', price: 1499, pv: 45, category: 'health', is_available: 1 },
  { id: 3, name: 'Маска для волос', price: 599, pv: 18, category: 'haircare', is_available: 1 },
  { id: 4, name: 'Сыворотка', price: 899, pv: 27, category: 'skincare', is_available: 1 },
  { id: 5, name: 'Гель для душа', price: 349, pv: 10, category: 'bodycare', is_available: 1 },
  { id: 6, name: 'Шампунь', price: 449, pv: 13, category: 'haircare', is_available: 1 },
  { id: 7, name: 'Зубная паста', price: 199, pv: 6, category: 'oral', is_available: 1 },
  { id: 8, name: 'Дезодорант', price: 299, pv: 9, category: 'bodycare', is_available: 1 },
];

describe('pvCalc.search by target_pv', () => {
  test('finds a combination meeting or exceeding target PV', () => {
    const { results } = search(products, { target_pv: 50, max_items: 10 });
    expect(results.length).toBeGreaterThan(0);
    for (const r of results) {
      expect(r.total_pv).toBeGreaterThanOrEqual(50);
      expect(r.items.length).toBeGreaterThan(0);
    }
  });

  test('returns up to 3 distinct combinations', () => {
    const { results } = search(products, { target_pv: 100, max_items: 10 });
    expect(results.length).toBeLessThanOrEqual(3);
    const keys = results.map((r) => `${r.total_pv}-${r.total_price}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  test('respects max_items constraint', () => {
    const { results } = search(products, { target_pv: 200, max_items: 3 });
    for (const r of results) {
      const totalQty = r.items.reduce((s, i) => s + i.quantity, 0);
      expect(totalQty).toBeLessThanOrEqual(3);
    }
  });

  test('respects excluded_categories', () => {
    const { results } = search(products, {
      target_pv: 30,
      max_items: 10,
      excluded_categories: ['skincare'],
    });
    for (const r of results) {
      for (const item of r.items) {
        const product = products.find((p) => p.id === item.product_id);
        expect(product.category).not.toBe('skincare');
      }
    }
  });

  test('runs within 500ms', () => {
    const start = Date.now();
    search(products, { target_pv: 300, max_items: 10 });
    expect(Date.now() - start).toBeLessThan(500);
  });

  test('throws on non-positive target_pv', () => {
    expect(() => search(products, { target_pv: 0 })).toThrow();
  });

  test('returns empty results when no products available', () => {
    const { results } = search([], { target_pv: 50 });
    expect(results).toEqual([]);
  });

  test('does not crash on fractional PV (e.g. products imported from the PDF catalog)', () => {
    const fractionalProducts = [
      { id: 101, name: 'Файбер', price: 440, pv: 3.2, category: 'home', is_available: 1 },
      { id: 102, name: 'БАД Кардио', price: 2470, pv: 16.3, category: 'health', is_available: 1 },
      { id: 103, name: 'Чайный напиток', price: 550, pv: 3.2, category: 'tea', is_available: 1 },
    ];
    const { results } = search(fractionalProducts, { target_pv: 30, max_items: 10 });
    expect(results.length).toBeGreaterThan(0);
    for (const r of results) {
      expect(r.total_pv).toBeGreaterThanOrEqual(30);
    }
  });

  test('reports the true (unrounded) total PV, not the rounded value used for indexing', () => {
    const fractionalProducts = [{ id: 201, name: 'Файбер', price: 100, pv: 3.2, category: 'home', is_available: 1 }];
    const { results } = search(fractionalProducts, { target_pv: 6, max_items: 10 });
    expect(results[0].total_pv).toBeCloseTo(6.4, 5); // 2 x 3.2 (indexing rounds 3.2 -> 3, so 2 picks already hit target 6)
  });

  test('carries product_url through from the product row when present (PDF catalog import)', () => {
    const withUrl = [
      { id: 301, name: 'Файбер', price: 440, pv: 30, category: 'home', is_available: 1, product_url: 'https://greenwayglobal.com/shop/brands/fiber/06006' },
    ];
    const { results } = search(withUrl, { target_pv: 30, max_items: 10 });
    expect(results[0].items[0].product_url).toBe('https://greenwayglobal.com/shop/brands/fiber/06006');
  });

  test('reports product_url as null when absent (pyapi catalog)', () => {
    const { results } = search(products, { target_pv: 24, max_items: 10 });
    expect(results[0].items[0].product_url).toBeNull();
  });
});

describe('pvCalc.search by target_price', () => {
  test('finds a combination within budget maximizing PV', () => {
    const { results } = search(products, { target_price: 2000, max_items: 10 });
    expect(results.length).toBe(1);
    const [combo] = results;
    expect(combo.total_price).toBeLessThanOrEqual(2000);
    expect(combo.total_pv).toBeGreaterThan(0);
  });

  test('throws on non-positive target_price', () => {
    expect(() => search(products, { target_price: -5 })).toThrow();
  });

  test('carries product_url through for the target_price search path too', () => {
    const withUrl = [
      { id: 301, name: 'Файбер', price: 440, pv: 3.2, category: 'home', is_available: 1, product_url: 'https://greenwayglobal.com/shop/brands/fiber/06006' },
    ];
    const { results } = search(withUrl, { target_price: 1000, max_items: 10 });
    expect(results[0].items[0].product_url).toBe('https://greenwayglobal.com/shop/brands/fiber/06006');
  });
});
