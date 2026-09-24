const fs = require('fs');
const path = require('path');
const os = require('os');

process.env.SQLITE_PATH = path.join(os.tmpdir(), `greenway-test-${Date.now()}.db`);
process.env.JWT_SECRET = 'test_secret';

const request = require('supertest');
const { createApp } = require('../../src/api/app');
const { getDb } = require('../../src/database/db');

const app = createApp();

beforeAll(() => {
  const db = getDb();
  db.prepare('INSERT INTO products (greenway_id, name, price, pv, category) VALUES (?, ?, ?, ?, ?)').run(
    'GW1',
    'Крем',
    799,
    24,
    'skincare'
  );
  db.prepare('INSERT INTO products (greenway_id, name, price, pv, category) VALUES (?, ?, ?, ?, ?)').run(
    'GW2',
    'Витамины',
    1499,
    45,
    'health'
  );
});

afterAll(() => {
  getDb().close();
  fs.rmSync(process.env.SQLITE_PATH, { force: true });
  fs.rmSync(`${process.env.SQLITE_PATH}-wal`, { force: true });
  fs.rmSync(`${process.env.SQLITE_PATH}-shm`, { force: true });
});

describe('Auth + PV-Calc API', () => {
  let token;

  test('POST /api/v1/auth/register requires consent', async () => {
    const res = await request(app).post('/api/v1/auth/register').send({
      telegram_id: 111,
      name: 'Ivan',
      phone: '+79991234567',
    });
    expect(res.status).toBe(400);
  });

  test('POST /api/v1/auth/register creates a partner', async () => {
    const res = await request(app).post('/api/v1/auth/register').send({
      telegram_id: 111,
      name: 'Ivan',
      phone: '+79991234567',
      consent_data_processing: true,
      consent_notifications: true,
    });
    expect(res.status).toBe(200);
    expect(res.body.partner_id).toBeDefined();
    expect(res.body.session_token).toBeDefined();
    token = res.body.session_token;
  });

  test('GET /api/v1/partners/me returns the authenticated partner', async () => {
    const res = await request(app).get('/api/v1/partners/me').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.telegram_id).toBe(111);
  });

  test('GET /api/v1/partners/me without token is rejected', async () => {
    const res = await request(app).get('/api/v1/partners/me');
    expect(res.status).toBe(401);
  });

  test('POST /api/v1/pv-calc/search returns combinations', async () => {
    const res = await request(app)
      .post('/api/v1/pv-calc/search')
      .set('Authorization', `Bearer ${token}`)
      .send({ target_pv: 40 });
    expect(res.status).toBe(200);
    expect(res.body.results.length).toBeGreaterThan(0);
  });
});
