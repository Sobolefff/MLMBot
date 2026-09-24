const crypto = require('crypto');
const config = require('../config');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;

function getKey() {
  const raw = config.gwTokenEncKey;
  if (!raw) {
    throw new Error(
      'GREENWAY_TOKEN_ENC_KEY is not set. It is required to store partner Greenway ' +
        'access/refresh tokens at rest — generate one with `openssl rand -hex 32` and set it in .env.'
    );
  }
  const key = Buffer.from(raw, 'hex');
  if (key.length !== 32) {
    throw new Error('GREENWAY_TOKEN_ENC_KEY must be a 32-byte value encoded as hex (64 hex chars).');
  }
  return key;
}

/** Encrypts a plaintext token, returning a single string safe to store in a TEXT column. */
function encryptToken(plaintext) {
  const key = getKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString('hex'), authTag.toString('hex'), ciphertext.toString('hex')].join(':');
}

/** Reverses encryptToken(). Throws if the payload was tampered with or the key is wrong. */
function decryptToken(payload) {
  const key = getKey();
  const [ivHex, authTagHex, ciphertextHex] = payload.split(':');
  if (!ivHex || !authTagHex || !ciphertextHex) {
    throw new Error('Malformed encrypted token payload');
  }
  const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(ciphertextHex, 'hex')), decipher.final()]);
  return plaintext.toString('utf8');
}

module.exports = { encryptToken, decryptToken };
