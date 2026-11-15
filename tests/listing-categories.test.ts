import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app, propertyRepository } from '../src/app.js';
import { migrate } from '../src/db.js';

const operator = { email: 'category-operator@example.com', password: 'StrongPassword123' };

describe('website listing categories', () => {
  beforeEach(async () => {
    await migrate();
    await propertyRepository.clear();
  });

  it('stores and returns a short-stay listing with nightly pricing', async () => {
    const auth = await request(app).post('/api/v1/auth/register').send(operator);
    expect(auth.status).toBe(201);
    const response = await request(app).post('/api/v1/properties')
      .set('Authorization', 'Bearer ' + auth.body.data.token)
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
  });

  it('keeps land category distinct from property type', async () => {
    const auth = await request(app).post('/api/v1/auth/register')
      .send({ email: 'land-operator@example.com', password: 'StrongPassword123' });
    const response = await request(app).post('/api/v1/properties')
      .set('Authorization', 'Bearer ' + auth.body.data.token)
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
