jest.mock('../../src/bot/apiClient', () => ({ request: jest.fn() }));

const apiClient = require('../../src/bot/apiClient');
const { ensureSession } = require('../../src/bot/session');

describe('ensureSession', () => {
  afterEach(() => jest.clearAllMocks());

  test('returns true immediately when a session token is already present', async () => {
    const ctx = { session: { token: 'existing-token' }, from: { id: 123 } };
    const ok = await ensureSession(ctx);
    expect(ok).toBe(true);
    expect(apiClient.request).not.toHaveBeenCalled();
  });

  test('silently re-authenticates an already-registered partner by telegram id', async () => {
    apiClient.request.mockResolvedValue({ session_token: 'fresh-token' });
    const ctx = { session: {}, from: { id: 456 } };

    const ok = await ensureSession(ctx);

    expect(ok).toBe(true);
    expect(ctx.session.token).toBe('fresh-token');
    expect(apiClient.request).toHaveBeenCalledWith('/auth/login', {
      method: 'POST',
      body: { telegram_id: 456 },
    });
  });

  test('creates ctx.session if it does not exist yet', async () => {
    apiClient.request.mockResolvedValue({ session_token: 'fresh-token' });
    const ctx = { from: { id: 789 } };

    const ok = await ensureSession(ctx);

    expect(ok).toBe(true);
    expect(ctx.session.token).toBe('fresh-token');
  });

  test('returns false for a telegram user who never registered', async () => {
    apiClient.request.mockRejectedValue(new Error('Partner not found'));
    const ctx = { session: {}, from: { id: 999 } };

    const ok = await ensureSession(ctx);

    expect(ok).toBe(false);
    expect(ctx.session.token).toBeUndefined();
  });
});
