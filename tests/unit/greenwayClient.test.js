const { GreenwayClient } = require('../../src/greenway/client');

function mockFetchOnce(status, body) {
  return jest.fn().mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
}

describe('GreenwayClient', () => {
  let originalFetch;

  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  test('throws without an access token', () => {
    expect(() => new GreenwayClient()).toThrow(/accessToken/);
  });

  test('sends the Authorization header and hits the expected URL', async () => {
    global.fetch = mockFetchOnce(200, { ok: true });
    const client = new GreenwayClient('token-123', { minIntervalMs: 0 });

    await client.getMainSummary();

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, opts] = global.fetch.mock.calls[0];
    expect(String(url)).toBe('https://pyapi.greenwaystart.com/pyapi/v1/greenway/main/');
    expect(opts.headers.Authorization).toBe('Bearer token-123');
  });

  test('getMainView builds the partner-scoped URL', async () => {
    global.fetch = mockFetchOnce(200, { qualification: 'S1' });
    const client = new GreenwayClient('token-123', { minIntervalMs: 0 });

    const result = await client.getMainView(3548132);

    expect(result).toEqual({ qualification: 'S1' });
    const [url] = global.fetch.mock.calls[0];
    expect(String(url)).toBe('https://pyapi.greenwaystart.com/pyapi/v1/greenway/analytics-2/main-view/3548132/');
  });

  test('getCumulativeSgoDynamics passes period query params', async () => {
    global.fetch = mockFetchOnce(200, {});
    const client = new GreenwayClient('token-123', { minIntervalMs: 0 });

    await client.getCumulativeSgoDynamics(3548132, 116, 117);

    const [url] = global.fetch.mock.calls[0];
    const parsed = new URL(String(url));
    expect(parsed.searchParams.get('first_period')).toBe('116');
    expect(parsed.searchParams.get('second_period')).toBe('117');
  });

  test('throws a TOKEN_EXPIRED error on 401 without retrying', async () => {
    global.fetch = mockFetchOnce(401, { detail: 'expired' });
    const client = new GreenwayClient('token-123', { minIntervalMs: 0 });

    await expect(client.getMainSummary()).rejects.toMatchObject({ code: 'TOKEN_EXPIRED' });
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  test('retries on transient failure and succeeds', async () => {
    global.fetch = jest
      .fn()
      .mockRejectedValueOnce(new Error('network blip'))
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ recovered: true }) });
    const client = new GreenwayClient('token-123', { minIntervalMs: 0 });

    const result = await client.getMainSummary();

    expect(result).toEqual({ recovered: true });
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  test('gives up after exhausting retries', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('down'));
    const client = new GreenwayClient('token-123', { minIntervalMs: 0 });

    await expect(client.getMainSummary()).rejects.toThrow('down');
    expect(global.fetch).toHaveBeenCalledTimes(3); // initial + 2 retries
  });
});
