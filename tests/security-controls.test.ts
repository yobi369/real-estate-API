import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHmac } from 'node:crypto';
import request from 'supertest';
import { config } from '../src/config.js';
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
    const addressDigest = createHmac('sha256', config.JWT_SECRET).update(ip).digest('hex');
    const persisted = await pool?.query<{ request_count: number; bucket_key: string }>(
      "SELECT request_count,bucket_key FROM api_rate_limit_buckets WHERE bucket_key=$1",
      [`auth-login:${addressDigest}`]
    );
    expect(Number(persisted?.rows[0]?.request_count)).toBe(11);
    expect(persisted?.rows[0]?.bucket_key).not.toContain(ip);
  });


  it('grants the runtime role only the shared rate-limit table privileges it needs', async () => {
    if (!pool) return;
    await pool.query(`DO $
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='secure_properties_runtime') THEN
          CREATE ROLE secure_properties_runtime;
        END IF;
      END
    $;`);
    await migrate();
    const privileges = await pool.query<{
      can_select: boolean; can_insert: boolean; can_update: boolean; can_delete: boolean;
      can_truncate: boolean; can_references: boolean; can_trigger: boolean;
    }>(`SELECT
      has_table_privilege('secure_properties_runtime','public.api_rate_limit_buckets','SELECT') AS can_select,
      has_table_privilege('secure_properties_runtime','public.api_rate_limit_buckets','INSERT') AS can_insert,
      has_table_privilege('secure_properties_runtime','public.api_rate_limit_buckets','UPDATE') AS can_update,
      has_table_privilege('secure_properties_runtime','public.api_rate_limit_buckets','DELETE') AS can_delete,
      has_table_privilege('secure_properties_runtime','public.api_rate_limit_buckets','TRUNCATE') AS can_truncate,
      has_table_privilege('secure_properties_runtime','public.api_rate_limit_buckets','REFERENCES') AS can_references,
      has_table_privilege('secure_properties_runtime','public.api_rate_limit_buckets','TRIGGER') AS can_trigger`);
    expect(privileges.rows[0]).toEqual({
      can_select: true, can_insert: true, can_update: true, can_delete: true,
      can_truncate: false, can_references: false, can_trigger: false
    });
  });

  it('rejects oversized JSON request bodies', async () => {
    const response = await request(app).post('/api/v1/auth/login')
      .set('X-Forwarded-For', '198.51.100.45')
      .send({ email: 'oversized@example.com', password: 'x'.repeat(1_100_000) });
    expect(response.status).toBe(413);
  });
});
