import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { app, propertyRepository } from '../src/app.js';
import { bootstrapAdmin, resetMemoryUsersForTests } from '../src/auth.js';
import { config } from '../src/config.js';
import { migrate, pool } from '../src/db.js';

async function createAdmin(email: string): Promise<string> {
  const result = await bootstrapAdmin({ email, password: 'StrongPassword123' }, config.ADMIN_BOOTSTRAP_TOKEN ?? '');
  if ('error' in result) throw new Error('Unable to bootstrap test administrator: ' + result.error);
  return result.token;
}

async function getAgencyId(token: string): Promise<string> {
  const response = await request(app).get('/api/v1/agencies/me').set('Authorization', 'Bearer ' + token);
  expect(response.status).toBe(200);
  const agencyId = response.body.data.items[0].id as string;
  if (pool) {
    const planId = randomUUID();
    await pool.query("INSERT INTO subscription_plans(id,code,name,price_minor,billing_interval,max_listings,max_members,is_active) VALUES($1,$2,'Test Unlimited',100,'month',NULL,NULL,false)", [planId, 'test-unlimited-' + agencyId.slice(0, 8)]);
    await pool.query("INSERT INTO agency_subscriptions(id,agency_id,plan_id,status,provider,current_period_start,current_period_end) SELECT gen_random_uuid(),$1,$2,'active','manual',now(),now()+interval '30 days' WHERE NOT EXISTS(SELECT 1 FROM agency_subscriptions WHERE agency_id=$1 AND status IN ('active','trialing'))", [agencyId, planId]);
  }
  return agencyId;
}

async function publish(token: string, id: string, agencyId: string): Promise<void> {
  const response = await request(app).patch(`/api/v1/properties/${id}/publication`)
    .set('Authorization', 'Bearer ' + token)
    .set('X-Agency-ID', agencyId)
    .send({ status: 'published' });
  expect(response.status).toBe(200);
}

describe('website listing categories', () => {
  beforeEach(async () => {
    await migrate();
    resetMemoryUsersForTests();
    if (pool) await pool.query('TRUNCATE TABLE inquiries, properties, users CASCADE');
    else await propertyRepository.clear();
  });

  it('stores and returns a short-stay listing with nightly pricing', async () => {
    const adminToken = await createAdmin('category-operator@example.com');
    const agencyId = await getAgencyId(adminToken);
    const response = await request(app).post('/api/v1/properties')
      .set('Authorization', 'Bearer ' + adminToken)
      .set('X-Agency-ID', agencyId)
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
    await publish(adminToken, response.body.data.id, agencyId);
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
    const agencyId = await getAgencyId(adminToken);
    const response = await request(app).post('/api/v1/properties')
      .set('Authorization', 'Bearer ' + adminToken)
      .set('X-Agency-ID', agencyId)
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
