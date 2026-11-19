import {beforeEach,describe,expect,it} from 'vitest';
import request from 'supertest';
import {app,propertyRepository} from '../src/app.js';
import {resetMemoryUsersForTests} from '../src/auth.js';
import {config} from '../src/config.js';
import {migrate,pool} from '../src/db.js';
import {PropertyRepository} from '../src/repositories/property-repository.js';
const sample={title:'Coastal family home',description:'Bright home near local amenities.',price:12500000,currency:'KES',propertyType:'house',transactionType:'sale',bedrooms:3,bathrooms:2,city:'Mombasa',country:'Kenya',imageUrls:[]};
const account=(email:string)=>({email,password:'StrongPassword123'});
let registerRequestNumber=0;
async function register(email:string){const r=await request(app).post('/api/v1/auth/register').set('X-Forwarded-For',`198.51.100.${++registerRequestNumber}`).send(account(email));expect(r.status).toBe(201);return r.body.data.token as string;}
let bootstrapRequestNumber=0;
async function bootstrap(email:string){const r=await request(app).post('/api/v1/admin/bootstrap').set('x-bootstrap-token',config.ADMIN_BOOTSTRAP_TOKEN ?? '').set('X-Forwarded-For',`192.0.2.${++bootstrapRequestNumber}`).send(account(email));expect(r.status).toBe(201);return r.body.data.token as string;}
async function agencyId(token:string){const r=await request(app).get('/api/v1/agencies/me').set('Authorization',`Bearer ${token}`);expect(r.status).toBe(200);expect(r.body.data.items.length).toBeGreaterThan(0);return r.body.data.items[0].id as string;}
async function publishListing(token:string,id:string,status='published'){return request(app).patch(`/api/v1/properties/${id}/publication`).set('Authorization',`Bearer ${token}`).set('X-Agency-ID',await agencyId(token)).send({status});}
beforeEach(async()=>{await migrate();await propertyRepository.clear();resetMemoryUsersForTests();if(pool)await pool.query('TRUNCATE TABLE properties, users CASCADE');});
describe('buyer demo',()=>{it('serves the interactive demo page and static assets',async()=>{expect((await request(app).get('/demo/')).status).toBe(200);expect((await request(app).get('/demo/app.js')).status).toBe(200);});it('returns isolated fictional sample listings and filters them',async()=>{const all=await request(app).get('/demo/properties');expect(all.status).toBe(200);expect(all.body.data.total).toBeGreaterThan(0);expect(all.body.data.notice).toContain('Fictional sample data');const machakos=await request(app).get('/demo/properties?city=Machakos');expect(machakos.body.data.total).toBe(1);expect(machakos.body.data.items[0].city).toBe('Machakos');const land=await request(app).get('/demo/properties?propertyType=land');expect(land.body.data.items.every((p:{propertyType:string})=>p.propertyType==='land')).toBe(true);});it('does not write demo records into the operational property repository',async()=>{const before=await propertyRepository.list({page:1,limit:100});await request(app).get('/demo/properties');const after=await propertyRepository.list({page:1,limit:100});expect(after.total).toBe(before.total);});});
describe('health/docs',()=>{it('reports liveness',async()=>{expect((await request(app).get('/health/live')).body.status).toBe('ok');});it('serves OpenAPI and Swagger UI',async()=>{expect((await request(app).get('/openapi.json')).status).toBe(200);expect((await request(app).get('/docs/')).status).toBe(200);});});
describe('authentication and authorization',()=>{it('requires a bearer token to create listings',async()=>{expect((await request(app).post('/api/v1/properties').send(sample)).status).toBe(401);});it('requires a verified agency context to publish listings',async()=>{const token=await bootstrap('context@example.com');expect((await request(app).post('/api/v1/properties').set('Authorization',`Bearer ${token}`).send(sample)).status).toBe(400);});it('registers and logs in',async()=>{await register('alice@example.com');const r=await request(app).post('/api/v1/auth/login').send(account('alice@example.com'));expect(r.status).toBe(200);expect(r.body.data.tokenType).toBe('Bearer');});it('rejects weak passwords, duplicate emails, and self-assigned admin roles',async()=>{expect((await request(app).post('/api/v1/auth/register').send({email:'weak@example.com',password:'bad'})).status).toBe(400);expect((await request(app).post('/api/v1/auth/register').send({...account('selfadmin@example.com'),role:'admin'})).status).toBe(400);await register('duplicate@example.com');expect((await request(app).post('/api/v1/auth/register').send(account('duplicate@example.com'))).status).toBe(409);});it('blocks another user from modifying a listing',async()=>{const owner=await bootstrap('owner@example.com');const intruder=await register('intruder@example.com');const other=await request(app).post('/api/v1/agencies').set('Authorization',`Bearer ${intruder}`).send({name:'Other Agency'});expect(other.status).toBe(201);const created=await request(app).post('/api/v1/properties').set('Authorization',`Bearer ${owner}`).set('X-Agency-ID',await agencyId(owner)).send(sample);expect(created.status).toBe(201);expect((await request(app).patch(`/api/v1/properties/${created.body.data.id}`).set('Authorization',`Bearer ${intruder}`).set('X-Agency-ID',other.body.data.id).send(sample)).status).toBe(404);expect((await request(app).delete(`/api/v1/properties/${created.body.data.id}`).set('Authorization',`Bearer ${intruder}`).set('X-Agency-ID',other.body.data.id)).status).toBe(404);});it('allows the owner to update and delete',async()=>{const token=await bootstrap('owner2@example.com');const created=await request(app).post('/api/v1/properties').set('Authorization',`Bearer ${token}`).set('X-Agency-ID',await agencyId(token)).send(sample);expect((await request(app).patch(`/api/v1/properties/${created.body.data.id}`).set('Authorization',`Bearer ${token}`).set('X-Agency-ID',await agencyId(token)).send({...sample,title:'Updated coastal home'})).status).toBe(200);expect((await request(app).delete(`/api/v1/properties/${created.body.data.id}`).set('Authorization',`Bearer ${token}`).set('X-Agency-ID',await agencyId(token))).status).toBe(204);});it('rejects invalid bearer tokens',async()=>{expect((await request(app).post('/api/v1/properties').set('Authorization','Bearer nonsense.token.value').send(sample)).status).toBe(401);});});
describe('properties',()=>{it('requires an administrator role to publish listings',async()=>{const user=await register('seller@example.com');expect((await request(app).post('/api/v1/properties').set('Authorization',`Bearer ${user}`).send(sample)).status).toBe(400);const admin=await bootstrap('agency-admin@example.com');const r=await request(app).post('/api/v1/properties').set('Authorization',`Bearer ${admin}`).set('X-Agency-ID',await agencyId(admin)).send(sample);expect(r.status).toBe(201);expect(r.body.data.id).toBeTruthy();});it('persists listings in PostgreSQL across repository instances',async()=>{if(!pool)return;const token=await bootstrap('persistent@example.com');const created=await request(app).post('/api/v1/properties').set('Authorization',`Bearer ${token}`).set('X-Agency-ID',await agencyId(token)).send(sample);expect(created.status).toBe(201);const reloaded=await new PropertyRepository().getById(created.body.data.id,await agencyId(token));expect(reloaded?.title).toBe(sample.title);expect(reloaded?.ownerId).toBeTruthy();expect(reloaded?.agencyId).toBe(await agencyId(token));});it('audits listing create, update and delete in the same transaction',async()=>{if(!pool)return;const token=await bootstrap('listing-audit@example.com');const agency=await agencyId(token);const created=await request(app).post('/api/v1/properties').set('Authorization',`Bearer ${token}`).set('X-Agency-ID',agency).send(sample);expect(created.status).toBe(201);const updated=await request(app).patch(`/api/v1/properties/${created.body.data.id}`).set('Authorization',`Bearer ${token}`).set('X-Agency-ID',agency).send({...sample,title:'Audited coastal home'});expect(updated.status).toBe(200);const deleted=await request(app).delete(`/api/v1/properties/${created.body.data.id}`).set('Authorization',`Bearer ${token}`).set('X-Agency-ID',agency);expect(deleted.status).toBe(204);const events=await pool.query<{action:string}>('SELECT action FROM audit_events WHERE entity_id=$1',[created.body.data.id]);expect(events.rows.map(row=>row.action).sort()).toEqual(['property.created','property.deleted','property.updated']);});it('keeps new listings private until an agency owner publishes them',async()=>{if(!pool)return;const token=await bootstrap('publication-owner@example.com');const created=await request(app).post('/api/v1/properties').set('Authorization',`Bearer ${token}`).set('X-Agency-ID',await agencyId(token)).send(sample);expect(created.status).toBe(201);expect(created.body.data.publicationStatus).toBe('draft');expect((await request(app).get(`/api/v1/properties/${created.body.data.id}`)).status).toBe(404);expect((await request(app).get('/api/v1/properties')).body.data.total).toBe(0);const published=await publishListing(token,created.body.data.id);expect(published.status).toBe(200);expect(published.body.data.publicationStatus).toBe('published');expect((await request(app).get(`/api/v1/properties/${created.body.data.id}`)).status).toBe(200);const audit=await pool!.query<{action:string}>('SELECT action FROM audit_events WHERE entity_id=$1 ORDER BY created_at DESC LIMIT 1',[created.body.data.id]);expect(audit.rows[0]?.action).toBe('property.publication.published');});it('rejects invalid prices',async()=>{const token=await bootstrap('seller2@example.com');expect((await request(app).post('/api/v1/properties').set('Authorization',`Bearer ${token}`).set('X-Agency-ID',await agencyId(token)).send({...sample,price:-1})).status).toBe(400);});it('filters and paginates',async()=>{const token=await bootstrap('seller3@example.com');const first=await request(app).post('/api/v1/properties').set('Authorization',`Bearer ${token}`).set('X-Agency-ID',await agencyId(token)).send(sample);const second=await request(app).post('/api/v1/properties').set('Authorization',`Bearer ${token}`).set('X-Agency-ID',await agencyId(token)).send({...sample,title:'Nairobi apartment',city:'Nairobi',propertyType:'apartment'});await publishListing(token,first.body.data.id);await publishListing(token,second.body.data.id);const r=await request(app).get('/api/v1/properties?city=Mombasa&page=1&limit=1');expect(r.body.data.total).toBe(1);expect(r.body.data.items).toHaveLength(1);});it('returns not-found and invalid-range errors',async()=>{expect((await request(app).get('/api/v1/properties/missing')).body.error.code).toBe('PROPERTY_NOT_FOUND');expect((await request(app).get('/missing')).body.error.code).toBe('NOT_FOUND');expect((await request(app).get('/api/v1/properties?minPrice=100&maxPrice=10')).status).toBe(400);});});

describe('agency-scoped enquiries',()=>{
 it('assigns general enquiries to the explicitly selected active agency',async()=>{
  const owner=await bootstrap('general-inquiry-owner@example.com');
  const memberships=await request(app).get('/api/v1/agencies/me').set('Authorization',`Bearer ${owner}`);
  const agency=memberships.body.data.items[0];
  const submitted=await request(app).post('/api/v1/inquiries').send({requestType:'general',name:'Interested Client',email:'client@example.com',phone:'+254700000001',message:'Please contact me about your services.',agencySlug:agency.slug});
  expect(submitted.status).toBe(201);
  const inbox=await request(app).get('/api/v1/inquiries').set('Authorization',`Bearer ${owner}`).set('X-Agency-ID',agency.id);
  expect(inbox.status).toBe(200);
  expect(inbox.body.data.items).toHaveLength(1);
  expect((await request(app).post('/api/v1/inquiries').send({requestType:'general',name:'Another Client',email:'client2@example.com',phone:'+254700000002',message:'Hello.',agencySlug:'missing-agency'})).status).toBe(400);
 });

 it('routes listing enquiries to the listing agency and hides them from other agencies',async()=>{
  const owner=await bootstrap('inquiry-owner@example.com');
  const ownerAgency=await agencyId(owner);
  const listing=await request(app).post('/api/v1/properties').set('Authorization',`Bearer ${owner}`).set('X-Agency-ID',ownerAgency).send(sample);
  expect(listing.status).toBe(201);
  await publishListing(owner,listing.body.data.id);
  const submitted=await request(app).post('/api/v1/inquiries').send({requestType:'viewing',name:'Buyer Person',email:'buyer@example.com',phone:'+254700000000',message:'I would like to arrange a viewing.',listingId:listing.body.data.id});
  expect(submitted.status).toBe(201);
  const ownerInbox=await request(app).get('/api/v1/inquiries').set('Authorization',`Bearer ${owner}`).set('X-Agency-ID',ownerAgency);
  expect(ownerInbox.status).toBe(200);
  expect(ownerInbox.body.data.items).toHaveLength(1);
  const otherUser=await register('other-inquiry@example.com');
  const otherAgency=await request(app).post('/api/v1/agencies').set('Authorization',`Bearer ${otherUser}`).send({name:'Other Enquiry Agency'});
  expect(otherAgency.status).toBe(201);
  const otherInbox=await request(app).get('/api/v1/inquiries').set('Authorization',`Bearer ${otherUser}`).set('X-Agency-ID',otherAgency.body.data.id);
  expect(otherInbox.status).toBe(200);
  expect(otherInbox.body.data.items).toHaveLength(0);
 });
});
describe('multi-agency schema foundation',()=>{it('creates agency tenancy, invitation and audit tables idempotently',async()=>{if(!pool)return;await migrate();const r=await pool.query<{name:string,exists:boolean}>(`SELECT name, to_regclass('public.'||name) IS NOT NULL AS exists FROM unnest(ARRAY['agencies','agency_memberships','agency_invitations','audit_events']) AS name`);expect(r.rows).toHaveLength(4);expect(r.rows.every(row=>row.exists)).toBe(true);const columns=await pool.query<{table_name:string,column_name:string}>(`SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='public' AND (table_name,column_name) IN (('properties','agency_id'),('inquiries','agency_id'))`);expect(columns.rows).toHaveLength(2);await migrate();});});

describe('agency onboarding',()=>{
 it('requires authentication to create or list agencies',async()=>{
  expect((await request(app).post('/api/v1/agencies').send({name:'Coastal Realty'})).status).toBe(401);
  expect((await request(app).get('/api/v1/agencies/me')).status).toBe(401);
 });
 it('validates agency names and creates an owner membership transactionally',async()=>{
  if(!pool)return;
  const token=await register('agency-founder@example.com');
  expect((await request(app).post('/api/v1/agencies').set('Authorization',`Bearer ${token}`).send({name:'x'})).status).toBe(400);
  const created=await request(app).post('/api/v1/agencies').set('Authorization',`Bearer ${token}`).send({name:'Coastal Realty Kenya'});
  expect(created.status).toBe(201);
  expect(created.body.data.name).toBe('Coastal Realty Kenya');
  expect(created.body.data.role).toBe('owner');
  expect(created.body.data.slug).toMatch(/^coastal-realty-kenya-[0-9a-f]{8}$/);
  const listed=await request(app).get('/api/v1/agencies/me').set('Authorization',`Bearer ${token}`);
  expect(listed.status).toBe(200);
  expect(listed.body.data.items).toHaveLength(1);
  expect(listed.body.data.items[0].id).toBe(created.body.data.id);
  const counts=await pool.query<{members:string;audits:string}>(`SELECT (SELECT count(*)::text FROM agency_memberships WHERE agency_id=$1) AS members,(SELECT count(*)::text FROM audit_events WHERE agency_id=$1) AS audits`,[created.body.data.id]);
  expect(counts.rows[0]).toEqual({members:'1',audits:'1'});
 });
 it('does not expose another user\'s agency memberships',async()=>{
  if(!pool)return;
  const first=await register('agency-first@example.com');
  const second=await register('agency-second@example.com');
  const created=await request(app).post('/api/v1/agencies').set('Authorization',`Bearer ${first}`).send({name:'First Agency'});
  const listed=await request(app).get('/api/v1/agencies/me').set('Authorization',`Bearer ${second}`);
  expect(listed.status).toBe(200);
  expect(listed.body.data.items).toHaveLength(0);
  expect(listed.body.data.items.some((item:{id:string})=>item.id===created.body.data.id)).toBe(false);
 });
});


describe('agency invitation security',()=>{
 it('creates, accepts, and audits an email-bound invitation exactly once',async()=>{
  if(!pool)return;
  const owner=await bootstrap('invitation-owner@example.com');
  const agency=await agencyId(owner);
  const invited=await register('invited-agent@example.com');
  const created=await request(app).post('/api/v1/agencies/invitations').set('Authorization',`Bearer ${owner}`).set('X-Agency-ID',agency).send({email:'invited-agent@example.com',role:'agent'});
  expect(created.status).toBe(201);
  expect(created.body.data.token).toBeTruthy();
  const accepted=await request(app).post('/api/v1/agencies/invitations/accept').set('Authorization',`Bearer ${invited}`).send({token:created.body.data.token});
  expect(accepted.status).toBe(200);
  expect(accepted.body.data).toEqual({agencyId:agency,role:'agent'});
  expect((await request(app).post('/api/v1/agencies/invitations/accept').set('Authorization',`Bearer ${invited}`).send({token:created.body.data.token})).status).toBe(400);
  const stored=await pool.query<{token_hash:string;accepted_at:Date|null;role:string}>('SELECT token_hash,accepted_at,role FROM agency_invitations WHERE id=$1',[created.body.data.id]);
  expect(stored.rows[0]?.token_hash).not.toBe(created.body.data.token);
  expect(stored.rows[0]?.accepted_at).toBeTruthy();
  expect(stored.rows[0]?.role).toBe('agent');
  const audit=await pool.query<{action:string}>("SELECT action FROM audit_events WHERE entity_type='agency_invitation' AND entity_id=$1 ORDER BY action",[created.body.data.id]);
  expect(audit.rows.map(row=>row.action)).toEqual(['agency.invitation.accepted','agency.invitation.created']);
  const forbidden=await request(app).post('/api/v1/agencies/invitations').set('Authorization',`Bearer ${invited}`).set('X-Agency-ID',agency).send({email:'another@example.com',role:'viewer'});
  expect(forbidden.status).toBe(403);
 });

 it('rejects email mismatch and supports agency-scoped revocation',async()=>{
  if(!pool)return;
  const owner=await bootstrap('invitation-owner-two@example.com');
  const agency=await agencyId(owner);
  const wrongUser=await register('wrong-recipient@example.com');
  const created=await request(app).post('/api/v1/agencies/invitations').set('Authorization',`Bearer ${owner}`).set('X-Agency-ID',agency).send({email:'right-recipient@example.com',role:'viewer'});
  expect(created.status).toBe(201);
  expect((await request(app).post('/api/v1/agencies/invitations/accept').set('Authorization',`Bearer ${wrongUser}`).send({token:created.body.data.token})).status).toBe(403);
  expect((await request(app).delete(`/api/v1/agencies/invitations/${created.body.data.id}`).set('Authorization',`Bearer ${owner}`).set('X-Agency-ID',agency)).status).toBe(204);
  expect((await request(app).post('/api/v1/agencies/invitations/accept').set('Authorization',`Bearer ${wrongUser}`).send({token:created.body.data.token})).status).toBe(400);
  const audit=await pool.query<{action:string}>("SELECT action FROM audit_events WHERE entity_type='agency_invitation' AND entity_id=$1",[created.body.data.id]);
  expect(audit.rows.map(row=>row.action).sort()).toEqual(['agency.invitation.created','agency.invitation.revoked']);
 });
});


describe('agency membership administration',()=>{
  async function invite(owner:string,agency:string,email:string,role:'admin'|'agent'|'viewer'){
    const recipient=await register(email);
    const created=await request(app).post('/api/v1/agencies/invitations')
      .set('Authorization',`Bearer ${owner}`).set('X-Agency-ID',agency).send({email,role});
    expect(created.status).toBe(201);
    const accepted=await request(app).post('/api/v1/agencies/invitations/accept')
      .set('Authorization',`Bearer ${recipient}`).send({token:created.body.data.token});
    expect(accepted.status).toBe(200);
    return recipient;
  }

  it('lists, updates, removes, and audits agency members while protecting the owner',async()=>{
    if(!pool)return;
    const owner=await bootstrap('membership-owner@example.com');
    const agency=await agencyId(owner);
    const agent=await invite(owner,agency,'membership-agent@example.com','agent');
    const agentId=(await request(app).get('/api/v1/agencies/members')
      .set('Authorization',`Bearer ${owner}`).set('X-Agency-ID',agency)).body.data.items
      .find((member:{email:string})=>member.email==='membership-agent@example.com')!.userId;
    const listing=await request(app).get('/api/v1/agencies/members')
      .set('Authorization',`Bearer ${owner}`).set('X-Agency-ID',agency);
    expect(listing.status).toBe(200);
    expect(listing.body.data.items.map((member:{role:string})=>member.role)).toContain('owner');
    expect((await request(app).patch(`/api/v1/agencies/members/${agentId}`)
      .set('Authorization',`Bearer ${owner}`).set('X-Agency-ID',agency).send({role:'viewer'})).status).toBe(200);
    expect((await request(app).patch(`/api/v1/agencies/members/${(await request(app).get('/api/v1/agencies/members').set('Authorization',`Bearer ${owner}`).set('X-Agency-ID',agency)).body.data.items.find((m:{email:string})=>m.email==='membership-owner@example.com')!.userId}`)
      .set('Authorization',`Bearer ${owner}`).set('X-Agency-ID',agency).send({role:'viewer'})).status).toBe(409);
    expect((await request(app).delete(`/api/v1/agencies/members/${agentId}`)
      .set('Authorization',`Bearer ${owner}`).set('X-Agency-ID',agency)).status).toBe(204);
    const member=await pool.query<{status:string;role:string}>('SELECT status,role FROM agency_memberships WHERE agency_id=$1 AND user_id=$2',[agency,agentId]);
    expect(member.rows[0]).toEqual({status:'suspended',role:'viewer'});
    const events=await pool.query<{action:string}>("SELECT action FROM audit_events WHERE entity_type='agency_membership' AND entity_id=$1 ORDER BY action",[agentId]);
    expect(events.rows.map(row=>row.action)).toEqual(['agency.member.removed','agency.member.role_updated']);
    expect(agent).toBeTruthy();
  });

  it('restricts admin management to agent/viewer members and blocks non-admin access',async()=>{
    if(!pool)return;
    const owner=await bootstrap('membership-owner-two@example.com');
    const agency=await agencyId(owner);
    const admin=await invite(owner,agency,'membership-admin@example.com','admin');
    const agent=await invite(owner,agency,'membership-agent-two@example.com','agent');
    const members=(await request(app).get('/api/v1/agencies/members').set('Authorization',`Bearer ${owner}`).set('X-Agency-ID',agency)).body.data.items;
    const adminId=members.find((m:{email:string})=>m.email==='membership-admin@example.com')!.userId;
    const agentId=members.find((m:{email:string})=>m.email==='membership-agent-two@example.com')!.userId;
    expect((await request(app).get('/api/v1/agencies/members').set('Authorization',`Bearer ${agent}`).set('X-Agency-ID',agency)).status).toBe(403);
    expect((await request(app).post('/api/v1/agencies/invitations').set('Authorization',`Bearer ${admin}`).set('X-Agency-ID',agency).send({email:'elevated-invite@example.com',role:'admin'})).status).toBe(403);
    expect((await request(app).patch(`/api/v1/agencies/members/${agentId}`).set('Authorization',`Bearer ${admin}`).set('X-Agency-ID',agency).send({role:'admin'})).status).toBe(403);
    expect((await request(app).delete(`/api/v1/agencies/members/${adminId}`).set('Authorization',`Bearer ${admin}`).set('X-Agency-ID',agency)).status).toBe(403);
    expect((await request(app).patch(`/api/v1/agencies/members/${adminId}`).set('Authorization',`Bearer ${owner}`).set('X-Agency-ID',agency).send({role:'viewer'})).status).toBe(200);
  });

  it('does not reveal or mutate memberships across agencies',async()=>{
    if(!pool)return;
    const first=await bootstrap('membership-first-owner@example.com');
    const firstAgency=await agencyId(first);
    const second=await register('membership-second-owner@example.com');
    const secondCreated=await request(app).post('/api/v1/agencies').set('Authorization',`Bearer ${second}`).send({name:'Second Membership Agency'});
    expect(secondCreated.status).toBe(201);
    expect((await request(app).get('/api/v1/agencies/members').set('Authorization',`Bearer ${second}`).set('X-Agency-ID',firstAgency)).status).toBe(403);
    expect((await request(app).get('/api/v1/agencies/members').set('Authorization',`Bearer ${first}`).set('X-Agency-ID',secondCreated.body.data.id)).status).toBe(403);
  });
});
