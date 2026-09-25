const fs = require('fs');
const path = require('path');
const os = require('os');

process.env.SQLITE_PATH = path.join(os.tmpdir(), `greenway-catalog-api-test-${Date.now()}.db`);
process.env.JWT_SECRET = 'test_secret';

// pdfCatalogParser loads pdfjs-dist (ESM-only) via a dynamic import(), which
// Jest's CommonJS test environment can't execute without extra flags. Mock
// the parsing step so this suite exercises the route's own auth/validation/
// error-handling instead of Jest's ESM support; the real parser is covered
// by tests/unit/pdfCatalogParser.test.js and a manual run under plain Node.
jest.mock('../../src/catalog/pdfCatalogParser', () => ({
  parsePdfCatalogBuffer: jest.fn().mockRejectedValue(new Error('Invalid PDF structure')),
  normalizeRecords: jest.requireActual('../../src/catalog/pdfCatalogParser').normalizeRecords,
}));

const request = require('supertest');
const { createApp } = require('../../src/api/app');
const { getDb } = require('../../src/database/db');

const app = createApp();

afterAll(() => {
  getDb().close();
  fs.rmSync(process.env.SQLITE_PATH, { force: true });
  fs.rmSync(`${process.env.SQLITE_PATH}-wal`, { force: true });
  fs.rmSync(`${process.env.SQLITE_PATH}-shm`, { force: true });
});

describe('POST /api/v1/catalog/import-pdf', () => {
  let token;

  beforeAll(async () => {
    const res = await request(app).post('/api/v1/auth/register').send({
      telegram_id: 222,
      name: 'Anna',
      phone: '+79997654321',
      consent_data_processing: true,
      consent_notifications: true,
    });
    token = res.body.session_token;
  });

  test('rejects requests without a session token', async () => {
    const res = await request(app)
      .post('/api/v1/catalog/import-pdf')
      .set('Content-Type', 'application/pdf')
      .send(Buffer.from('%PDF-1.4 not a real file'));
    expect(res.status).toBe(401);
  });

  test('rejects a body that is not sent as application/pdf', async () => {
    const res = await request(app)
      .post('/api/v1/catalog/import-pdf')
      .set('Authorization', `Bearer ${token}`)
      .send({ not: 'a pdf' });
    expect(res.status).toBe(400);
  });

  test('surfaces a parse failure as a 400 without touching the catalog', async () => {
    const res = await request(app)
      .post('/api/v1/catalog/import-pdf')
      .set('Authorization', `Bearer ${token}`)
      .set('Content-Type', 'application/pdf')
      .send(Buffer.from('this is definitely not a pdf'));
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();

    const db = getDb();
    const count = db.prepare("SELECT COUNT(*) AS c FROM products WHERE greenway_id LIKE 'pdf-%'").get().c;
    expect(count).toBe(0);
  });
});
