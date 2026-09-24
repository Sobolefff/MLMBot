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
  let partnerId;

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
    partnerId = res.body.partner_id;
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

  test('PUT /api/v1/partners/:id/settings updates notification prefs', async () => {
    const res = await request(app)
      .put(`/api/v1/partners/${partnerId}/settings`)
      .set('Authorization', `Bearer ${token}`)
      .send({ notifications_enabled: false });
    expect(res.status).toBe(200);
    expect(res.body.notifications_enabled).toBe(0);
  });

  test('PUT /api/v1/partners/:id/settings rejects another partner id', async () => {
    const res = await request(app)
      .put(`/api/v1/partners/${partnerId + 999}/settings`)
      .set('Authorization', `Bearer ${token}`)
      .send({ notifications_enabled: true });
    expect(res.status).toBe(403);
  });

  let clientId;

  test('POST /api/v1/partners/:id/clients creates a client', async () => {
    const res = await request(app)
      .post(`/api/v1/partners/${partnerId}/clients`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Мария Сидорова', phone: '+79997654321' });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Мария Сидорова');
    clientId = res.body.id;
  });

  test('POST /api/v1/chains/activate activates a chain for the client', async () => {
    const res = await request(app)
      .post('/api/v1/chains/activate')
      .set('Authorization', `Bearer ${token}`)
      .send({ client_id: clientId, trigger_days: 10 });
    expect(res.status).toBe(200);
    expect(res.body.is_active).toBe(1);
  });

  test('GET /api/v1/chains/list includes the activated chain', async () => {
    const res = await request(app).get('/api/v1/chains/list').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.some((c) => c.client_id === clientId)).toBe(true);
  });

  test('DELETE /api/v1/partners/:id/clients/:clientId removes the client', async () => {
    const res = await request(app)
      .delete(`/api/v1/partners/${partnerId}/clients/${clientId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);

    const clients = await request(app).get(`/api/v1/partners/${partnerId}/clients`).set('Authorization', `Bearer ${token}`);
    expect(clients.body.find((c) => c.id === clientId)).toBeUndefined();
  });

  test('POST /api/v1/auth/login is rate limited after repeated attempts', async () => {
    let lastStatus;
    for (let i = 0; i < 25; i++) {
      const res = await request(app).post('/api/v1/auth/login').send({ telegram_id: 999999 });
      lastStatus = res.status;
    }
    expect(lastStatus).toBe(429);
  });

  test('DELETE /api/v1/partners/:id removes all partner data (ФЗ-152 right to erasure)', async () => {
    const res = await request(app).delete(`/api/v1/partners/${partnerId}`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);

    const me = await request(app).get('/api/v1/partners/me').set('Authorization', `Bearer ${token}`);
    expect(me.status).toBe(404);
  });
});

