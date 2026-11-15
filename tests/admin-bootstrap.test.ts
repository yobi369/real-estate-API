import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { resetMemoryUsersForTests } from '../src/auth.js';
import { config } from '../src/config.js';
import { migrate, pool } from '../src/db.js';

const bootstrapToken = config.ADMIN_BOOTSTRAP_TOKEN;

beforeEach(async () => {
  await migrate();
  resetMemoryUsersForTests();
  if (pool) await pool.query('TRUNCATE TABLE inquiries, properties, users CASCADE');
});

describe('one-time administrator bootstrap', () => {
  it('rejects an incorrect bootstrap token without revealing availability', async () => {
    const response = await request(app).post('/api/v1/admin/bootstrap')
      .set('x-bootstrap-token', 'incorrect-bootstrap-token')
      .send({ email: 'admin@example.com', password: 'StrongPassword123' });
    expect(response.status).toBe(404);
  });

  it('creates exactly one administrator and grants inbox access', async () => {
    const response = await request(app).post('/api/v1/admin/bootstrap')
      .set('x-bootstrap-token', bootstrapToken ?? ''
      .send({ email: 'agency-admin@example.com', password: 'StrongPassword123' });
    expect(response.status).toBe(201);
    expect(response.body.data.user.role).toBe('admin');

    const inbox = await request(app).get('/api/v1/inquiries')
      .set('Authorization', 'Bearer ' + response.body.data.token);
    expect(inbox.status).toBe(200);

    const second = await request(app).post('/api/v1/admin/bootstrap')
      .set('x-bootstrap-token', bootstrapToken!)
      .send({ email: 'second-admin@example.com', password: 'AnotherStrongPassword123' });
    expect(second.status).toBe(409);
  });
});
