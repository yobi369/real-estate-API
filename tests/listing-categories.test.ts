import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app, propertyRepository } from '../src/app.js';
import { bootstrapAdmin, resetMemoryUsersForTests } from '../src/auth.js';
import { config } from '../src/config.js';
import { migrate, pool } from '../src/db.js';

async function createAdmin(email: string): Promise<string> {
  const result = await bootstrapAdmin({ email, password: 'StrongPassword123' }, config.ADMIN_BOOTSTRAP_TOKEN ?? '');
  if ('error' in result) throw new Error('Unable to bootstrap test administrator: ' + result.error);
  return result.token;
}

async function getAgencyId(token: string): Promise<string> {\n  const response = await request(app).get('/api/v1/agencies/me').set('Authorization', 'Bearer ' + token);\n  expect(response.status).toBe(200);\n  return response.body.data.items[0].id as string;\n}\n\nasync function publish(token: string, id: string, agencyId: string): Promise<void> {\n  const response = await request(app).patch(`/api/v1/properties/${id}/publication`)\n    .set('Authorization', 'Bearer ' + token).set('X-Agency-ID', agencyId).send({ status: 'published' });\n  expect(response.status).toBe(200);\n}\n\ndescribe('website listing categories', () => {
  beforeEach(async () => {
    await migrate();
    resetMemoryUsersForTests();
    if (pool) await pool.query('TRUNCATE TABLE inquiries, properties, users CASCADE');
    else await propertyRepository.clear();
  });

  it('stores and returns a short-stay listing with nightly pricing', async () => {
    const adminToken = await createAdmin('category-operator@example.com');
    const response = await request(app).post('/api/v1/properties')
      .set('Authorization', 'Bearer ' + adminToken)
      .send({
        title: 'Kamakis Executive Stay',
        description: 'Furnished short-stay apartment.',
        category: 'airbnb',
        price: 3500,
        priceType: 'night',
        propertyType: 'apartment',
        transactionType: 'rent',
        city: 'Ruiru',
        location: 'Kamakis',
        address: 'Kamakis, Ruiru, Kenya',
        imageUrls: []
      });
    expect(response.status).toBe(201);
    expect(response.body.data.category).toBe('airbnb');
    expect(response.body.data.priceType).toBe('night');
    const search = await request(app).get('/api/v1/properties?category=airbnb');
    expect(search.body.data.total).toBe(1);
    expect(search.body.data.items[0].location).toBe('Kamakis');
    expect(search.body.data.items[0].ownerId).toBeUndefined();
    const detail = await request(app).get('/api/v1/properties/' + response.body.data.id);
    expect(detail.status).toBe(200);
    expect(detail.body.data.ownerId).toBeUndefined();
  });

  it('keeps land category distinct from property type', async () => {
    const adminToken = await createAdmin('land-operator@example.com');
    const response = await request(app).post('/api/v1/properties')
      .set('Authorization', 'Bearer ' + adminToken)
      .send({
        title: 'Kithimani Plot',
        description: 'Residential plot.',
        category: 'land',
        price: 850000,
        propertyType: 'land',
        transactionType: 'sale',
        city: 'Machakos',
        location: 'Kithimani',
        address: 'Kithimani, Machakos, Kenya',
        sizeAcres: 0.125,
        titleStatus: 'Title deed available',
        imageUrls: []
      });
    expect(response.status).toBe(201);
    expect(response.body.data.category).toBe('land');
    expect(response.body.data.propertyType).toBe('land');
  });
});
