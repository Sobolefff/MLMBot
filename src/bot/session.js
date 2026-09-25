const apiClient = require('./apiClient');

/**
 * Session data lives only in memory (see `session()` in src/bot/index.js)
 * and is wiped on every bot restart/deploy. Rather than force an
 * already-registered partner back through the full consent/name/phone flow,
 * silently reissue a session token from the durable `partners` row via their
 * Telegram id - the JWT is a cheap, stateless credential, not the source of
 * truth, so there is nothing to actually recover here except re-derive it.
 */
async function ensureSession(ctx) {
  if (ctx.session?.token) return true;
  try {
    const { session_token } = await apiClient.request('/auth/login', {
      method: 'POST',
      body: { telegram_id: ctx.from.id },
    });
    ctx.session ??= {};
    ctx.session.token = session_token;
    return true;
  } catch (err) {
    return false;
  }
}

module.exports = { ensureSession };
