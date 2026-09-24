const crypto = require('crypto');

const TEST_KEY = crypto.randomBytes(32).toString('hex');

function freshTokenCrypto(envKey) {
  jest.resetModules();
  process.env.GREENWAY_TOKEN_ENC_KEY = envKey;
  return require('../../src/greenway/tokenCrypto');
}

describe('greenway/tokenCrypto', () => {
  afterEach(() => {
    delete process.env.GREENWAY_TOKEN_ENC_KEY;
    jest.resetModules();
  });

  test('round-trips a plaintext token', () => {
    const { encryptToken, decryptToken } = freshTokenCrypto(TEST_KEY);
    const plaintext = 'super-secret-access-token-value';
    const encrypted = decryptToken(encryptToken(plaintext));
    expect(encrypted).toBe(plaintext);
  });

  test('produces different ciphertext for the same plaintext (random IV)', () => {
    const { encryptToken } = freshTokenCrypto(TEST_KEY);
    const a = encryptToken('same-value');
    const b = encryptToken('same-value');
    expect(a).not.toBe(b);
  });

  test('throws when the encryption key is missing', () => {
    const { encryptToken } = freshTokenCrypto('');
    expect(() => encryptToken('x')).toThrow(/GREENWAY_TOKEN_ENC_KEY/);
  });

  test('throws when the encryption key is not 32 bytes', () => {
    const { encryptToken } = freshTokenCrypto('abcd');
    expect(() => encryptToken('x')).toThrow(/32-byte/);
  });

  test('throws on tampered ciphertext (auth tag mismatch)', () => {
    const { encryptToken, decryptToken } = freshTokenCrypto(TEST_KEY);
    const encrypted = encryptToken('original-value');
    const [iv, authTag, ciphertext] = encrypted.split(':');
    const tampered = [iv, authTag, ciphertext.slice(0, -2) + '00'].join(':');
    expect(() => decryptToken(tampered)).toThrow();
  });

  test('throws on malformed payload', () => {
    const { decryptToken } = freshTokenCrypto(TEST_KEY);
    expect(() => decryptToken('not-a-valid-payload')).toThrow(/Malformed/);
  });
});
