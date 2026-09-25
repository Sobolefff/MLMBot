describe('config.apiBaseUrl', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...ORIGINAL_ENV };
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  test('defaults to localhost on the configured port (bare-metal: one host, two processes)', () => {
    delete process.env.API_BASE_URL;
    process.env.PORT = '4000';
    const config = require('../../src/config');
    expect(config.apiBaseUrl).toBe('http://localhost:4000/api/v1');
  });

  test('honors an explicit override (needed under docker-compose, where app/bot are separate containers)', () => {
    process.env.API_BASE_URL = 'http://app:3000/api/v1';
    const config = require('../../src/config');
    expect(config.apiBaseUrl).toBe('http://app:3000/api/v1');
  });
});
