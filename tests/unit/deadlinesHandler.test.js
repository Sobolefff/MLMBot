const { parseMoscowDate, remainingPv } = require('../../src/bot/handlers/deadlines');

describe('parseMoscowDate', () => {
  test('parses a date with an explicit time as Moscow time (UTC+3)', () => {
    const date = parseMoscowDate('31.12.2026 18:00');
    expect(date.toISOString()).toBe('2026-12-31T15:00:00.000Z');
  });

  test('defaults to end of day (23:59 Moscow) when no time is given', () => {
    const date = parseMoscowDate('01.01.2027');
    expect(date.toISOString()).toBe('2027-01-01T20:59:00.000Z');
  });

  test('rejects a calendar date that does not exist (e.g. 31 February)', () => {
    expect(parseMoscowDate('31.02.2026')).toBeNull();
  });

  test('rejects text that is not in ДД.ММ.ГГГГ format', () => {
    expect(parseMoscowDate('завтра вечером')).toBeNull();
    expect(parseMoscowDate('2026-12-31')).toBeNull();
  });
});

describe('remainingPv', () => {
  test('returns target minus current', () => {
    expect(remainingPv({ target_pv: 150, current_pv: 40 })).toBe(110);
  });

  test('never goes negative when current already exceeds target', () => {
    expect(remainingPv({ target_pv: 150, current_pv: 200 })).toBe(0);
  });
});
