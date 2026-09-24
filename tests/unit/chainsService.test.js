const { isChainDue } = require('../../src/api/services/chainsService');

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = Date.now();

describe('chainsService.isChainDue', () => {
  test('not due when last order is recent', () => {
    const chain = { trigger_days: 10, last_order_date: new Date(NOW - 3 * DAY_MS).toISOString() };
    expect(isChainDue(chain, NOW)).toBe(false);
  });

  test('due when days since last order meets trigger_days', () => {
    const chain = { trigger_days: 10, last_order_date: new Date(NOW - 10 * DAY_MS).toISOString() };
    expect(isChainDue(chain, NOW)).toBe(true);
  });

  test('falls back to client_created_at when no order exists yet', () => {
    const chain = {
      trigger_days: 10,
      last_order_date: null,
      client_created_at: new Date(NOW - 12 * DAY_MS).toISOString(),
    };
    expect(isChainDue(chain, NOW)).toBe(true);
  });

  test('not due again within trigger_days of last notification', () => {
    const chain = {
      trigger_days: 10,
      last_order_date: new Date(NOW - 20 * DAY_MS).toISOString(),
      last_notified_at: new Date(NOW - 2 * DAY_MS).toISOString(),
    };
    expect(isChainDue(chain, NOW)).toBe(false);
  });

  test('due again once trigger_days have passed since last notification', () => {
    const chain = {
      trigger_days: 10,
      last_order_date: new Date(NOW - 30 * DAY_MS).toISOString(),
      last_notified_at: new Date(NOW - 11 * DAY_MS).toISOString(),
    };
    expect(isChainDue(chain, NOW)).toBe(true);
  });

  test('not due when there is no reference date at all', () => {
    const chain = { trigger_days: 10, last_order_date: null, client_created_at: null };
    expect(isChainDue(chain, NOW)).toBe(false);
  });
});
