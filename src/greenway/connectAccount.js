/**
 * Manual bridge until the Greenway login/refresh endpoints are confirmed
 * (see TODO.md). Stores an access token obtained by hand via DevTools
 * (see the console snippet in memory `reference-greenway-pyapi`) encrypted
 * against a partner's account, so GreenwayClient/catalog sync can use it.
 *
 * Usage:
 *   GW_MANUAL_ACCESS_TOKEN=<token> [GW_MANUAL_REFRESH_TOKEN=<token>] \
 *     node src/greenway/connectAccount.js <partner_id> <gw_partner_id>
 *
 * <partner_id>    — our bot's partners.id (not the Telegram ID)
 * <gw_partner_id> — Greenway's internal id, from auth/info/ → user.id
 */
const { getDb } = require('../database/db');
const { encryptToken } = require('./tokenCrypto');

function main() {
  const [partnerId, gwPartnerId] = process.argv.slice(2);
  const accessToken = process.env.GW_MANUAL_ACCESS_TOKEN;
  const refreshToken = process.env.GW_MANUAL_REFRESH_TOKEN;

  if (!partnerId || !gwPartnerId || !accessToken) {
    console.error(
      'Usage: GW_MANUAL_ACCESS_TOKEN=<token> [GW_MANUAL_REFRESH_TOKEN=<token>] ' +
        'node src/greenway/connectAccount.js <partner_id> <gw_partner_id>'
    );
    process.exit(1);
  }

  const db = getDb();
  const partner = db.prepare('SELECT id FROM partners WHERE id = ?').get(partnerId);
  if (!partner) {
    console.error(`No partner with id=${partnerId} found in the local DB.`);
    process.exit(1);
  }

  const accessEncrypted = encryptToken(accessToken);
  const refreshEncrypted = refreshToken ? encryptToken(refreshToken) : null;

  db.prepare(
    `INSERT INTO greenway_accounts (partner_id, gw_partner_id, access_token_encrypted, refresh_token_encrypted, is_active)
     VALUES (?, ?, ?, ?, 1)
     ON CONFLICT(partner_id) DO UPDATE SET
       gw_partner_id = excluded.gw_partner_id,
       access_token_encrypted = excluded.access_token_encrypted,
       refresh_token_encrypted = excluded.refresh_token_encrypted,
       is_active = 1`
  ).run(partnerId, gwPartnerId, accessEncrypted, refreshEncrypted);

  console.log(`Connected Greenway account (gw_partner_id=${gwPartnerId}) to partner ${partnerId}.`);
  db.close();
}

if (require.main === module) {
  main();
}

module.exports = { main };
