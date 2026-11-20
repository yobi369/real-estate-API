import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { migrate, pool } from '../src/db.js';

beforeAll(async () => { await migrate(); });
afterAll(async () => { if (pool) await pool.query('TRUNCATE TABLE inquiries, properties, users CASCADE'); });

describe('API security controls', () => {
  it('sets baseline browser security headers and omits the Express fingerprint', async () => {
    const response = await request(app).get('/health/live');
    expect(response.status).toBe(200);
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-frame-options']).toBeTruthy();
    expect(response.headers['x-powered-by']).toBeUndefined();
  });

  it('rate-limits repeated authentication attempts by client IP', async () => {
    const ip = '198.51.100.44';
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const response = await request(app).post('/api/v1/auth/login')
        .set('X-Forwarded-For', ip)
        .send({ email: 'unknown@example.com', password: 'WrongPassword123' });
      expect(response.status).toBe(401);
    }
    const blocked = await request(app).post('/api/v1/auth/login')
      .set('X-Forwarded-For', ip)
      .send({ email: 'unknown@example.com', password: 'WrongPassword123' });
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe('RATE_LIMITED');
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
    // Sustained blocked traffic must not grow the persisted counter without bound.
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const repeated = await request(app).post('/api/v1/auth/login')
        .set('X-Forwarded-For', ip)
        .send({ email: 'unknown@example.com', password: 'WrongPassword123' });
      expect(repeated.status).toBe(429);
    }
    const persisted = await pool?.query<{ request_count: number }>(
      "SELECT request_count FROM api_rate_limit_buckets WHERE bucket_key=$1",
      [`auth-login:${ip}`]
    );
    expect(Number(persisted?.rows[0]?.request_count)).toBe(11);
  });

  it('rejects oversized JSON request bodies', async () => {
    const response = await request(app).post('/api/v1/auth/login')
      .set('X-Forwarded-For', '198.51.100.45')
      .send({ email: 'oversized@example.com', password: 'x'.repeat(1_100_000) });
    expect(response.status).toBe(413);
  });
});
