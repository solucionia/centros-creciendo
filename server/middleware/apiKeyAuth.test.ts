import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { apiKeyAuth } from './apiKeyAuth';

const API_KEY = 'test-api-key-1234';

function buildApp(locationId?: string) {
  process.env.GHL_MIDDLEWARE_API_KEY = API_KEY;
  if (locationId) {
    process.env.GHL_LOCATION_ID = locationId;
  } else {
    delete process.env.GHL_LOCATION_ID;
  }
  const app = express();
  app.use(express.json());
  app.get('/test', apiKeyAuth, (_req, res) => res.json({ ok: true }));
  return app;
}

beforeEach(() => {
  process.env.GHL_MIDDLEWARE_API_KEY = API_KEY;
  delete process.env.GHL_LOCATION_ID;
});

afterEach(() => {
  delete process.env.GHL_MIDDLEWARE_API_KEY;
  delete process.env.GHL_LOCATION_ID;
});

describe('apiKeyAuth', () => {
  it('passes when X-API-Key matches', async () => {
    const app = buildApp();
    const res = await request(app).get('/test').set('X-API-Key', API_KEY);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('returns 401 when X-API-Key is missing', async () => {
    const app = buildApp();
    const res = await request(app).get('/test');
    expect(res.status).toBe(401);
    expect(res.body.codigo_error).toBe('API_KEY_INVALIDA');
    expect(res.body.success).toBe(false);
  });

  it('returns 401 when X-API-Key is wrong', async () => {
    const app = buildApp();
    const res = await request(app).get('/test').set('X-API-Key', 'wrong-key');
    expect(res.status).toBe(401);
    expect(res.body.codigo_error).toBe('API_KEY_INVALIDA');
  });

  it('passes when GHL_LOCATION_ID matches X-CRM-Location', async () => {
    const app = buildApp('loc-abc');
    const res = await request(app)
      .get('/test')
      .set('X-API-Key', API_KEY)
      .set('X-CRM-Location', 'loc-abc');
    expect(res.status).toBe(200);
  });

  it('returns 401 when GHL_LOCATION_ID is set but X-CRM-Location is missing', async () => {
    const app = buildApp('loc-abc');
    const res = await request(app).get('/test').set('X-API-Key', API_KEY);
    expect(res.status).toBe(401);
    expect(res.body.codigo_error).toBe('API_KEY_INVALIDA');
  });

  it('returns 401 when GHL_LOCATION_ID is set but X-CRM-Location mismatches', async () => {
    const app = buildApp('loc-abc');
    const res = await request(app)
      .get('/test')
      .set('X-API-Key', API_KEY)
      .set('X-CRM-Location', 'loc-wrong');
    expect(res.status).toBe(401);
  });

  it('ignores X-CRM-Location when GHL_LOCATION_ID is not set', async () => {
    const app = buildApp(); // no GHL_LOCATION_ID
    const res = await request(app)
      .get('/test')
      .set('X-API-Key', API_KEY)
      .set('X-CRM-Location', 'any-value-is-fine');
    expect(res.status).toBe(200);
  });
});
