import {beforeEach,describe,expect,it} from 'vitest';
import request from 'supertest';
import {app,inquiryRepository} from '../src/app.js';
import {migrate} from '../src/db.js';
const payload={requestType:'viewing',name:'Amina Buyer',email:'amina@example.com',phone:'+254700000000',message:'I would like to arrange a viewing.',listingTitle:'Riverside apartment',listingCategory:'property'};
beforeEach(async()=>{await migrate();await inquiryRepository.clear();});
describe('customer enquiries',()=>{
 it('validates and stores a public viewing request',async()=>{const r=await request(app).post('/api/v1/inquiries').send(payload);expect(r.status).toBe(201);expect(r.body.data.id).toBeTruthy();expect(r.body.data.status).toBe('new');expect(r.body.data.listingTitle).toBe(payload.listingTitle);expect((await inquiryRepository.list()).length).toBe(1);});
 it('rejects malformed contact details',async()=>{expect((await request(app).post('/api/v1/inquiries').send({...payload,email:'not-an-email'})).status).toBe(400);});
 it('does not expose the enquiry inbox publicly',async()=>{expect((await request(app).get('/api/v1/inquiries')).status).toBe(401);});
 it('rejects non-admin users from the enquiry inbox',async()=>{const r=await request(app).post('/api/v1/auth/register').send({email:'agent@example.com',password:'StrongPassword123'});expect(r.status).toBe(201);expect((await request(app).get('/api/v1/inquiries').set('Authorization',`Bearer ${r.body.data.token}`)).status).toBe(403);});

 it('rate-limits repeated public enquiry submissions by client IP',async()=>{const client='203.0.113.77';for(let i=0;i<10;i++){const accepted=await request(app).post('/api/v1/inquiries').set('X-Forwarded-For',client).send({...payload,email:`buyer${i}@example.com`});expect(accepted.status).toBe(201);}const blocked=await request(app).post('/api/v1/inquiries').set('X-Forwarded-For',client).send(payload);expect(blocked.status).toBe(429);expect(blocked.body.error.code).toBe('RATE_LIMITED');});
});
