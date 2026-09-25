const { formatCombo } = require('../../src/bot/handlers/pvCalc');

describe('formatCombo', () => {
  test('adds a product link line under an item that has one (from the PDF catalog import)', () => {
    const combo = {
      total_price: 440,
      total_pv: 3.2,
      items: [
        {
          name: 'Файбер для мытья посуды',
          quantity: 1,
          price: 440,
          pv: 3.2,
          product_url: 'https://greenwayglobal.com/shop/brands/fiber/06006',
        },
      ],
    };
    const text = formatCombo(combo, 0);
    expect(text).toContain('Файбер для мытья посуды');
    expect(text).toContain('https://greenwayglobal.com/shop/brands/fiber/06006');
  });

  test('omits the link line for a product without one (e.g. from the pyapi catalog)', () => {
    const combo = {
      total_price: 799,
      total_pv: 24,
      items: [{ name: 'Крем для лица', quantity: 1, price: 799, pv: 24, product_url: null }],
    };
    const text = formatCombo(combo, 0);
    expect(text).not.toMatch(/https?:\/\//);
  });

  test('handles items with no product_url field at all', () => {
    const combo = { total_price: 799, total_pv: 24, items: [{ name: 'Крем для лица', quantity: 1, price: 799, pv: 24 }] };
    expect(() => formatCombo(combo, 0)).not.toThrow();
  });
});
