const { classifyFontRole, buildRecordsFromItems, normalizeRecords } = require('../../src/catalog/pdfCatalogParser');

const PAGE_WIDTH = 420;

function item(text, x, y, height, font) {
  return { text, x, y, height, font: `ABCDE+${font}` };
}

describe('classifyFontRole', () => {
  test('recognizes the name font at body size', () => {
    expect(classifyFontRole('XYZ+Noah-ExtraBold', 8.0)).toBe('name');
  });

  test('does not treat a large ExtraBold banner headline as a product name', () => {
    expect(classifyFontRole('XYZ+Noah-ExtraBold', 21.0)).toBe('other');
  });

  test('recognizes the running category header', () => {
    expect(classifyFontRole('XYZ+Noah-Regular', 10.0)).toBe('category');
  });

  test('treats description/price/dimension fonts as other', () => {
    expect(classifyFontRole('XYZ+Noah-Light', 8.0)).toBe('other');
    expect(classifyFontRole('XYZ+Noah-Bold', 8.0)).toBe('other');
    expect(classifyFontRole('XYZ+Noah-Medium', 11.0)).toBe('other');
  });
});

describe('buildRecordsFromItems', () => {
  test('reconstructs a simple product card from a left column', () => {
    const items = [
      item('ФАЙБЕР ДЛЯ МЫТЬЯ ПОСУДЫ HOME S1', 36, 520, 8.0, 'Noah-ExtraBold'),
      item('Мягкая сторона бережно моет.', 60, 500, 8.0, 'Noah-Light'),
      item('20 × 16 см', 36, 415, 8.0, 'Noah-Bold'),
      item('#06001 #06002', 60, 386, 5.5, 'Noah-Medium'),
      item('440 ₽', 51, 371, 11.0, 'Noah-Medium'),
      item('3,2 PV', 100, 371, 11.0, 'Noah-Medium'),
    ];

    const { records } = buildRecordsFromItems(items, PAGE_WIDTH, null);

    expect(records).toEqual([
      { name: 'ФАЙБЕР ДЛЯ МЫТЬЯ ПОСУДЫ HOME S1', codes: ['06001', '06002'], price: 440, pv: 3.2, category: null },
    ]);
  });

  test('concatenates a multi-line title before any code is seen', () => {
    const items = [
      item('ПАКЕТ', 36, 500, 8.0, 'Noah-ExtraBold'),
      item('STILL GREEN', 36, 490, 8.0, 'Noah-ExtraBold'),
      item('БОЛЬШОЙ', 36, 480, 8.0, 'Noah-ExtraBold'),
      item('37 × 32 × 20 см #17047', 36, 460, 8.0, 'Noah-Bold'),
      item('55 ₽', 36, 440, 11.0, 'Noah-Medium'),
      item('0,2 PV', 60, 440, 11.0, 'Noah-Medium'),
    ];

    const { records } = buildRecordsFromItems(items, PAGE_WIDTH, null);

    expect(records).toHaveLength(1);
    expect(records[0].name).toBe('ПАКЕТ STILL GREEN БОЛЬШОЙ');
    expect(records[0].codes).toEqual(['17047']);
  });

  test('pools several SKUs behind one shared price for flavour/scent variants', () => {
    const items = [
      item('BALANCER DRAIN MAXI', 36, 520, 8.0, 'Noah-ExtraBold'),
      item('10 стиков #01224', 36, 480, 8.0, 'Noah-Bold'),
      item('со вкусом «ЛАЙМ»', 36, 460, 8.0, 'Noah-ExtraBold'),
      item('10 стиков #012630', 36, 440, 8.0, 'Noah-Bold'),
      item('840 ₽', 36, 420, 11.0, 'Noah-Medium'),
      item('5,5 PV', 60, 420, 11.0, 'Noah-Medium'),
    ];

    const { records } = buildRecordsFromItems(items, PAGE_WIDTH, null);

    expect(records).toHaveLength(1);
    expect(records[0].codes).toEqual(['01224', '012630']);
    expect(records[0].price).toBe(840);
  });

  test('picks up the running per-page category header', () => {
    const items = [
      item('WELLLAB', 300, 550, 10.0, 'Noah-Regular'),
      item('БАД «ВЕЛЛАБ КАРДИО КОМПЛЕКС»', 36, 520, 8.0, 'Noah-ExtraBold'),
      item('60 капсул #070703', 36, 460, 8.0, 'Noah-Bold'),
      item('2 470 ₽', 36, 440, 11.0, 'Noah-Medium'),
      item('16,3 PV', 60, 440, 11.0, 'Noah-Medium'),
    ];

    const { records, category } = buildRecordsFromItems(items, PAGE_WIDTH, null);

    expect(category).toBe('WELLLAB');
    expect(records[0].category).toBe('WELLLAB');
    expect(records[0].price).toBe(2470);
  });

  test('carries the category forward from a previous page when absent', () => {
    const items = [
      item('ТОВАР', 36, 520, 8.0, 'Noah-ExtraBold'),
      item('#00001', 36, 460, 5.5, 'Noah-Medium'),
      item('100 ₽', 36, 440, 11.0, 'Noah-Medium'),
      item('1 PV', 60, 440, 11.0, 'Noah-Medium'),
    ];
    const { category } = buildRecordsFromItems(items, PAGE_WIDTH, 'GREEN FIBER HOME');
    expect(category).toBe('GREEN FIBER HOME');
  });

  test('discards a decorative headline that never gets a code/price (marketing intro pages)', () => {
    const items = [item('БЕЗОПАСНОСТЬ ЭФФЕКТИВНОСТЬ', 36, 520, 8.0, 'Noah-ExtraBold')];
    const { records, incomplete } = buildRecordsFromItems(items, PAGE_WIDTH, null);
    expect(records).toEqual([]);
    expect(incomplete).toEqual(['БЕЗОПАСНОСТЬ ЭФФЕКТИВНОСТЬ']);
  });

  test('splits left/right columns independently and preserves per-column order', () => {
    const items = [
      // right column product, printed visually above the left column one
      item('ФАЙБЕР ВЕЛЬВЕТОВЫЙ HOME S5', 217, 521, 8.0, 'Noah-ExtraBold'),
      item('#06036', 300, 386, 5.5, 'Noah-Medium'),
      item('1 030 ₽', 228, 371, 11.0, 'Noah-Medium'),
      item('7,4 PV', 281, 371, 11.0, 'Noah-Medium'),
      // left column product
      item('ДИСК «ИНВОЛВЕР» HOME S2', 36, 521, 8.0, 'Noah-ExtraBold'),
      item('#06019', 60, 386, 5.5, 'Noah-Medium'),
      item('870 ₽', 51, 371, 11.0, 'Noah-Medium'),
      item('6,3 PV', 100, 371, 11.0, 'Noah-Medium'),
    ];

    const { records } = buildRecordsFromItems(items, PAGE_WIDTH, null);

    expect(records).toHaveLength(2);
    expect(records.find((r) => r.codes.includes('06019')).name).toBe('ДИСК «ИНВОЛВЕР» HOME S2');
    expect(records.find((r) => r.codes.includes('06036')).name).toBe('ФАЙБЕР ВЕЛЬВЕТОВЫЙ HOME S5');
  });
});

describe('normalizeRecords', () => {
  test('expands one card with several SKUs into one row per SKU', () => {
    const rows = normalizeRecords([{ name: 'Товар', codes: ['1', '2'], price: 100, pv: 1, category: 'X' }]);
    expect(rows).toEqual([
      { greenway_id: 'pdf-1', name: 'Товар', price: 100, pv: 1, category: 'X' },
      { greenway_id: 'pdf-2', name: 'Товар', price: 100, pv: 1, category: 'X' },
    ]);
  });

  test('synthesizes a stable id for a card printed without any SKU', () => {
    const record = { name: 'Набор «Код молодости»', codes: [], price: 25500, pv: 200, category: 'Наборы' };
    const [rowA] = normalizeRecords([record]);
    const [rowB] = normalizeRecords([record]);
    expect(rowA.greenway_id).toBe(rowB.greenway_id);
    expect(rowA.greenway_id).toMatch(/^pdf-x-/);
  });
});
