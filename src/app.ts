import express from 'express';
import { resolve } from 'node:path';
import cors from 'cors';
import helmet from 'helmet';
import { createRequire } from 'node:module';
import swaggerUi from 'swagger-ui-express';
import { randomUUID } from 'node:crypto';
import { config } from './config.js';
import { propertyInputSchema,propertyQuerySchema } from './domain/property.js';
import { inquiryInputSchema } from './domain/inquiry.js';
import { PropertyRepository, type StoredProperty } from './repositories/property-repository.js';
import { InquiryRepository } from './repositories/inquiry-repository.js';
import { AgencyRepository } from './repositories/agency-repository.js';
import { AgencyInvitationRepository, type InvitationRole } from './repositories/agency-invitation-repository.js';
import { z } from 'zod';
import { demoProperties } from './demo-data.js';
import { pool } from './db.js';
import { authenticate,bootstrapAdmin,loginUser,registerUser } from './auth.js';
import { createRateLimiter } from './rate-limit.js';
const require = createRequire(import.meta.url);
type PinoHttpOptions = { level: string; genReqId: (req: express.Request, res: express.Response) => string; redact: string[] };
const pinoHttp = require('pino-http') as (options: PinoHttpOptions) => express.RequestHandler;
export const app=express();
export const propertyRepository=new PropertyRepository();
export const inquiryRepository=new InquiryRepository();
export const agencyRepository=new AgencyRepository();
export const agencyInvitationRepository=new AgencyInvitationRepository();
const invitationCreateSchema=z.object({email:z.string().trim().email().max(254).transform(v=>v.toLowerCase()),role:z.enum(['admin','agent','viewer'])}).strict();
const invitationAcceptSchema=z.object({token:z.string().min(32).max(128)}).strict();
const agencyCreateSchema=z.object({name:z.string().trim().min(2).max(160)}).strict();
const resolveActiveAgency=async(req:express.Request,res:express.Response):Promise<{id:string;role:'owner'|'admin'|'agent'|'viewer'}|null>=>{
 const agencyId=req.header('x-agency-id');
 if(!agencyId||!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(agencyId)){
  res.status(400).json({error:{code:'AGENCY_CONTEXT_REQUIRED',message:'Provide a valid X-Agency-ID for this operation'}});return null;
 }
 try{
  const membership=await agencyRepository.getActiveMembership(req.principal!.id,agencyId);
  if(!membership){res.status(403).json({error:{code:'AGENCY_ACCESS_DENIED',message:'You are not an active member of this agency'}});return null;}
  return {id:agencyId,role:membership.role};
 }catch(error){
  if(error instanceof Error&&error.message==='PERSISTENCE_REQUIRED'){res.status(503).json({error:{code:'PERSISTENCE_REQUIRED',message:'Agency-scoped operations require PostgreSQL persistence'}});return null;}
  throw error;
 }
};
const toPublicProperty=(property:StoredProperty)=>{const {ownerId,agencyId,...publicFields}=property;void ownerId;void agencyId;return publicFields;};
const authBootstrapRateLimit=createRateLimiter({windowMs:15*60*1000,max:5});
const authRegisterRateLimit=createRateLimiter({windowMs:15*60*1000,max:10});
const authLoginRateLimit=createRateLimiter({windowMs:15*60*1000,max:10});
const publicSearchRateLimit=createRateLimiter({windowMs:60*1000,max:120});
const inquiryRateLimits=new Map<string,{count:number;resetAt:number}>();
const inquiryRateLimit:express.RequestHandler=(req,res,next)=>{
 const now=Date.now();const key=req.ip||req.socket.remoteAddress||'unknown';
 let entry=inquiryRateLimits.get(key);
 if(!entry||entry.resetAt<=now){entry={count:0,resetAt:now+15*60*1000};}
 if(entry.count>=10){res.setHeader('Retry-After',String(Math.max(1,Math.ceil((entry.resetAt-now)/1000))));return res.status(429).json({error:{code:'RATE_LIMITED',message:'Too many enquiries. Please try again later.'}});}
 entry.count+=1;inquiryRateLimits.set(key,entry);
 if(inquiryRateLimits.size>5000){for(const [ip,value] of inquiryRateLimits){if(value.resetAt<=now)inquiryRateLimits.delete(ip);}}
 return next();
};

app.disable('x-powered-by');app.set('trust proxy',1);app.use(helmet());
app.use(cors({origin:config.CORS_ORIGIN.split(',').map(v=>v.trim()),credentials:false}));
app.use(express.json({limit:'1mb',strict:true}));
app.use(pinoHttp({level:config.LOG_LEVEL,genReqId:(req,res)=>{const h=req.headers['x-request-id'];const id=typeof h==='string'&&/^[a-zA-Z0-9._-]{1,100}$/.test(h)?h:randomUUID();res.setHeader('x-request-id',id);return id;},redact:['req.headers.authorization','req.headers.cookie','req.headers.x-bootstrap-token']}));
const spec={
 openapi:'3.1.0',info:{title:'Real Estate API',version:'1.2.0',description:'Property, short-stay and land inventory with authenticated listing management and persisted customer enquiries.'},servers:[{url:'/'}],
 tags:[{name:'Properties',description:'Search and manage property listings.'},{name:'Inquiries',description:'Receive and review customer enquiries.'},{name:'Agencies',description:'Create and discover agency workspaces.'},{name:'Authentication',description:'Register and authenticate listing operators.'},{name:'Health',description:'Service health and readiness.'}],
 paths:{
  '/health/live':{get:{tags:['Health'],summary:'Check process liveness',responses:{'200':{description:'Process is alive'}}}},
  '/health/ready':{get:{tags:['Health'],summary:'Check database readiness',responses:{'200':{description:'Database is ready'},'503':{description:'Database unavailable or not configured'}}}},
  '/api/v1/admin/bootstrap':{post:{tags:['Authentication'],summary:'Create the first administrator once using a bootstrap secret',parameters:[{name:'x-bootstrap-token',in:'header',required:true,schema:{type:'string'}}],requestBody:{required:true,content:{'application/json':{schema:{type:'object',required:['email','password'],properties:{email:{type:'string',format:'email'},password:{type:'string',minLength:12}}}}}},responses:{'201':{description:'Administrator created'},'404':{description:'Bootstrap unavailable'},'409':{description:'An administrator already exists'}}}},
  '/api/v1/auth/register':{post:{tags:['Authentication'],summary:'Register a listing operator',requestBody:{required:true,content:{'application/json':{schema:{type:'object',required:['email','password'],properties:{email:{type:'string',format:'email'},password:{type:'string',minLength:12}}}}}},responses:{'201':{description:'Account created'},'400':{description:'Invalid registration input'},'409':{description:'Email already registered'}}}},
  '/api/v1/auth/login':{post:{tags:['Authentication'],summary:'Authenticate a listing operator',requestBody:{required:true,content:{'application/json':{schema:{type:'object',required:['email','password'],properties:{email:{type:'string',format:'email'},password:{type:'string'}}}}}},responses:{'200':{description:'Authenticated'},'401':{description:'Invalid credentials'}}}},
  '/api/v1/agencies':{post:{tags:['Agencies'],summary:'Create an agency workspace and become its owner',security:[{bearerAuth:[]}],requestBody:{required:true,content:{'application/json':{schema:{type:'object',additionalProperties:false,required:['name'],properties:{name:{type:'string',minLength:2,maxLength:160}}}}}},responses:{'201':{description:'Agency created'},'400':{description:'Invalid agency name'},'401':{description:'Authentication required'},'503':{description:'Persistent storage required'}}}},
  '/api/v1/agencies/me':{get:{tags:['Agencies'],summary:'List the authenticated user\'s active agencies',security:[{bearerAuth:[]}],responses:{'200':{description:'Agency memberships'},'401':{description:'Authentication required'},'503':{description:'Persistent storage required'}}}},
  '/api/v1/agencies/members':{get:{tags:['Agencies'],summary:'List members in the selected agency (owner/admin only)',security:[{bearerAuth:[]}],parameters:[{name:'X-Agency-ID',in:'header',required:true,schema:{type:'string',format:'uuid'}}],responses:{'200':{description:'Agency members'},'403':{description:'Owner/admin permission required'}}}},
  '/api/v1/agencies/members/{userId}':{patch:{tags:['Agencies'],summary:'Change a non-owner member role',security:[{bearerAuth:[]}],parameters:[{name:'userId',in:'path',required:true,schema:{type:'string',format:'uuid'}},{name:'X-Agency-ID',in:'header',required:true,schema:{type:'string',format:'uuid'}}],requestBody:{required:true,content:{'application/json':{schema:{type:'object',additionalProperties:false,required:['role'],properties:{role:{type:'string',enum:['admin','agent','viewer']}}}}}},responses:{'200':{description:'Member role updated'},'403':{description:'Role change not permitted'},'404':{description:'Active member not found'},'409':{description:'Owner role is immutable'}}},delete:{tags:['Agencies'],summary:'Remove an active non-owner member',security:[{bearerAuth:[]}],parameters:[{name:'userId',in:'path',required:true,schema:{type:'string',format:'uuid'}},{name:'X-Agency-ID',in:'header',required:true,schema:{type:'string',format:'uuid'}}],responses:{'204':{description:'Member removed'},'403':{description:'Removal not permitted'},'404':{description:'Active member not found'},'409':{description:'Last owner cannot be removed'}}}},
  '/api/v1/agencies/invitations':{post:{tags:['Agencies'],summary:'Create an email-bound agency invitation (owner/admin only)',security:[{bearerAuth:[]}],parameters:[{name:'X-Agency-ID',in:'header',required:true,schema:{type:'string',format:'uuid'}}],requestBody:{required:true,content:{'application/json':{schema:{type:'object',additionalProperties:false,required:['email','role'],properties:{email:{type:'string',format:'email'},role:{type:'string',enum:['admin','agent','viewer']}}}}}},responses:{'201':{description:'Invitation created; token is returned once for trusted delivery'},'403':{description:'Agency owner/admin permission required'},'409':{description:'Pending invitation already exists'},'503':{description:'PostgreSQL required'}}}},
  '/api/v1/agencies/invitations/accept':{post:{tags:['Agencies'],summary:'Accept an invitation using the authenticated matching email account',security:[{bearerAuth:[]}],requestBody:{required:true,content:{'application/json':{schema:{type:'object',additionalProperties:false,required:['token'],properties:{token:{type:'string'}}}}}},responses:{'200':{description:'Agency membership activated'},'400':{description:'Invalid, expired, revoked, or used invitation'},'403':{description:'Invitation email does not match authenticated account'}}}},
  '/api/v1/agencies/invitations/{id}':{delete:{tags:['Agencies'],summary:'Revoke a pending invitation (owner/admin only)',security:[{bearerAuth:[]}],parameters:[{name:'id',in:'path',required:true,schema:{type:'string',format:'uuid'}},{name:'X-Agency-ID',in:'header',required:true,schema:{type:'string',format:'uuid'}}],responses:{'204':{description:'Invitation revoked'},'403':{description:'Agency owner/admin permission required'},'404':{description:'Pending invitation not found'}}}},
  '/api/v1/properties':{get:{tags:['Properties'],summary:'Search public property listings',parameters:[{name:'page',in:'query',schema:{type:'integer',minimum:1}},{name:'limit',in:'query',schema:{type:'integer',minimum:1,maximum:100}},{name:'city',in:'query',schema:{type:'string'}},{name:'category',in:'query',schema:{type:'string',enum:['property','airbnb','land']}},{name:'propertyType',in:'query',schema:{type:'string',enum:['apartment','house','land','commercial']}},{name:'transactionType',in:'query',schema:{type:'string',enum:['sale','rent','lease']}},{name:'minPrice',in:'query',schema:{type:'number'}},{name:'maxPrice',in:'query',schema:{type:'number'}},{name:'search',in:'query',schema:{type:'string'}}],responses:{'200':{description:'Paginated live listings'},'400':{description:'Invalid query'}}},post:{tags:['Properties'],summary:'Create a draft property, short-stay or land listing within an active agency',security:[{bearerAuth:[]}],parameters:[{name:'X-Agency-ID',in:'header',required:true,schema:{type:'string',format:'uuid'}}],requestBody:{required:true,content:{'application/json':{schema:{$ref:'#/components/schemas/PropertyInput'}}}},responses:{'201':{description:'Listing created'},'401':{description:'Authentication required'},'403':{description:'Administrator permission required'}}}},
  '/api/v1/properties/{id}/publication':{patch:{tags:['Properties'],summary:'Publish, unpublish or archive a listing (agency owner/admin only)',security:[{bearerAuth:[]}],parameters:[{name:'id',in:'path',required:true,schema:{type:'string',format:'uuid'}},{name:'X-Agency-ID',in:'header',required:true,schema:{type:'string',format:'uuid'}}],requestBody:{required:true,content:{'application/json':{schema:{type:'object',additionalProperties:false,required:['status'],properties:{status:{type:'string',enum:['draft','published','archived']}}}}}},responses:{'200':{description:'Publication state updated and audited'},'403':{description:'Agency owner/admin permission required'},'404':{description:'Listing not found in this agency'},'503':{description:'PostgreSQL required'}}}},
  '/api/v1/properties/{id}':{parameters:[{name:'id',in:'path',required:true,schema:{type:'string',format:'uuid'}}],get:{tags:['Properties'],summary:'Retrieve one listing',responses:{'200':{description:'Listing found'},'404':{description:'Not found'}}},patch:{tags:['Properties'],summary:'Update a listing within the selected agency',security:[{bearerAuth:[]}],parameters:[{name:'X-Agency-ID',in:'header',required:true,schema:{type:'string',format:'uuid'}}],responses:{'200':{description:'Updated'},'403':{description:'Forbidden'}}},delete:{tags:['Properties'],summary:'Delete a listing within the selected agency',security:[{bearerAuth:[]}],parameters:[{name:'X-Agency-ID',in:'header',required:true,schema:{type:'string',format:'uuid'}}],responses:{'204':{description:'Deleted'},'403':{description:'Forbidden'}}}},
  '/api/v1/inquiries':{post:{tags:['Inquiries'],summary:'Submit a customer enquiry, viewing or stay request',requestBody:{required:true,content:{'application/json':{schema:{$ref:'#/components/schemas/InquiryInput'}}}},responses:{'201':{description:'Enquiry persisted'},'400':{description:'Invalid enquiry'}}},get:{tags:['Inquiries'],summary:'List enquiries belonging to the selected agency (owner/admin only)',security:[{bearerAuth:[]}],parameters:[{name:'X-Agency-ID',in:'header',required:true,schema:{type:'string',format:'uuid'}}],responses:{'200':{description:'Recent enquiries'},'401':{description:'Authentication required'},'403':{description:'Admin permission required'}}}}
 },
 components:{securitySchemes:{bearerAuth:{type:'http',scheme:'bearer',bearerFormat:'JWT'}},schemas:{
  PropertyInput:{type:'object',additionalProperties:false,required:['title','description','price','propertyType','transactionType','city'],properties:{title:{type:'string'},slug:{type:'string'},description:{type:'string'},category:{type:'string',enum:['property','airbnb','land']},price:{type:'number'},priceType:{type:'string',enum:['night','total']},currency:{type:'string',enum:['KES','USD','GBP']},propertyType:{type:'string',enum:['apartment','house','land','commercial']},transactionType:{type:'string',enum:['sale','rent','lease']},bedrooms:{type:'integer'},bathrooms:{type:'integer'},city:{type:'string'},location:{type:'string'},address:{type:'string'},country:{type:'string'},areaSqm:{type:'number'},sizeAcres:{type:'number'},titleStatus:{type:'string'},landUse:{type:'string'},maxGuests:{type:'integer'},featured:{type:'boolean'},imageUrls:{type:'array',items:{type:'string',format:'uri'}}}},
  InquiryInput:{type:'object',additionalProperties:false,required:['requestType','name','email','phone','message'],properties:{requestType:{type:'string',enum:['general','booking','viewing','site_visit']},name:{type:'string'},email:{type:'string',format:'email'},phone:{type:'string'},message:{type:'string'},service:{type:'string'},listingId:{type:'string',format:'uuid'},listingTitle:{type:'string'},listingCategory:{type:'string',enum:['property','airbnb','land']},checkIn:{type:'string',format:'date'},checkOut:{type:'string',format:'date'},guests:{type:'integer'},visitDate:{type:'string',format:'date'},pickupPoint:{type:'string'},agencySlug:{type:'string',description:'Active agency slug for general enquiries without a listing ID'}}}
 }}
};
app.get('/health/live',(_req,res)=>res.json({status:'ok',service:'real-estate-api'}));
app.get('/health/ready',async(_req,res)=>{if(!pool)return res.status(503).json({status:'degraded',persistence:'in-memory-development-adapter'});try{await pool.query('SELECT 1');return res.status(200).json({status:'ready',persistence:'postgresql'});}catch{return res.status(503).json({status:'degraded',persistence:'postgresql'});}});
app.get('/demo/properties',publicSearchRateLimit,(req,res)=>{const parsed=propertyQuerySchema.safeParse(req.query);if(!parsed.success)return res.status(400).json({error:{code:'VALIDATION_ERROR',message:'Query parameters are invalid'}});const q=parsed.data;const needle=q.search?.toLocaleLowerCase();const matches=demoProperties.filter(p=>(!q.city||p.city.toLocaleLowerCase()===q.city.toLocaleLowerCase())&&(!q.propertyType||p.propertyType===q.propertyType)&&(!q.transactionType||p.transactionType===q.transactionType)&&(q.minPrice===undefined||p.price>=q.minPrice)&&(q.maxPrice===undefined||p.price<=q.maxPrice)&&(!needle||`${p.title} ${p.description} ${p.city}`.toLocaleLowerCase().includes(needle))).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));const start=(q.page-1)*q.limit;return res.json({data:{items:matches.slice(start,start+q.limit),total:matches.length,page:q.page,limit:q.limit,notice:'Fictional sample data for demonstration only. Not live property listings.'}});});
app.get('/openapi.json',(_req,res)=>res.json(spec));app.use('/docs',swaggerUi.serve,swaggerUi.setup(spec));
app.post('/api/v1/admin/bootstrap',authBootstrapRateLimit,async(req,res)=>{const result=await bootstrapAdmin(req.body,req.header('x-bootstrap-token')??'');if('error'in result){const status=result.error==='DISABLED'?404:result.error==='EXISTS'?409:400;return res.status(status).json({error:{code:result.error,message:result.error==='DISABLED'?'Bootstrap is unavailable':result.error==='EXISTS'?'An administrator already exists':'Administrator details are invalid'}});}return res.status(201).json({data:{user:result.principal,token:result.token,tokenType:'Bearer',expiresIn:config.JWT_TTL_SECONDS}});});
app.post('/api/v1/auth/register',authRegisterRateLimit,async(req,res)=>{const result=await registerUser(req.body);if('error'in result)return res.status(result.error==='EXISTS'?409:400).json({error:{code:result.error==='EXISTS'?'EMAIL_EXISTS':'VALIDATION_ERROR',message:result.error==='EXISTS'?'An account with this email already exists':'Email or password does not meet requirements'}});return res.status(201).json({data:{user:result.principal,token:result.token,tokenType:'Bearer',expiresIn:config.JWT_TTL_SECONDS}});});
app.post('/api/v1/auth/login',authLoginRateLimit,async(req,res)=>{const result=await loginUser(req.body);if(!result)return res.status(401).json({error:{code:'INVALID_CREDENTIALS',message:'Email or password is incorrect'}});return res.json({data:{user:result.principal,token:result.token,tokenType:'Bearer',expiresIn:config.JWT_TTL_SECONDS}});});
app.post('/api/v1/agencies',authenticate,async(req,res)=>{
 const parsed=agencyCreateSchema.safeParse(req.body);
 if(!parsed.success)return res.status(400).json({error:{code:'VALIDATION_ERROR',message:'Agency name must contain 2 to 160 characters'}});
 try{
  const agency=await agencyRepository.createForUser(req.principal!.id,parsed.data.name);
  return res.status(201).location(`/api/v1/agencies/${agency.id}`).json({data:agency});
 }catch(error){
  if(error instanceof Error&&error.message==='PERSISTENCE_REQUIRED')return res.status(503).json({error:{code:'PERSISTENCE_REQUIRED',message:'Agency workspaces require PostgreSQL persistence'}});
  throw error;
 }
});
app.get('/api/v1/agencies/me',authenticate,async(req,res)=>{
 try{return res.json({data:{items:await agencyRepository.listForUser(req.principal!.id)}});}
 catch(error){
  if(error instanceof Error&&error.message==='PERSISTENCE_REQUIRED')return res.status(503).json({error:{code:'PERSISTENCE_REQUIRED',message:'Agency workspaces require PostgreSQL persistence'}});
  throw error;
 }
});
app.get('/api/v1/agencies/members',authenticate,async(req,res)=>{
 const agency=await resolveActiveAgency(req,res);if(!agency)return;
 if(!['owner','admin'].includes(agency.role))return res.status(403).json({error:{code:'FORBIDDEN',message:'Agency owner or admin permission is required'}});
 try{return res.json({data:{items:await agencyRepository.listMembers(agency.id)}});}
 catch(error){if(error instanceof Error&&error.message==='PERSISTENCE_REQUIRED')return res.status(503).json({error:{code:'PERSISTENCE_REQUIRED',message:'Agency membership administration requires PostgreSQL persistence'}});throw error;}
});
app.patch('/api/v1/agencies/members/:userId',authenticate,async(req,res)=>{
 const agency=await resolveActiveAgency(req,res);if(!agency)return;
 if(!['owner','admin'].includes(agency.role))return res.status(403).json({error:{code:'FORBIDDEN',message:'Agency owner or admin permission is required'}});
 const userId=String(req.params.userId);
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId))return res.status(404).json({error:{code:'MEMBER_NOT_FOUND',message:'Active agency member was not found'}});
 if(userId===req.principal!.id)return res.status(409).json({error:{code:'SELF_ROLE_CHANGE_BLOCKED',message:'You cannot change your own agency role'}});
 const parsed=z.object({role:z.enum(['admin','agent','viewer'])}).strict().safeParse(req.body);
 if(!parsed.success)return res.status(400).json({error:{code:'VALIDATION_ERROR',message:'A valid non-owner member role is required'}});
 try{
  const members=await agencyRepository.listMembers(agency.id);
  const target=members.find(member=>member.userId===userId&&member.status==='active');
  if(!target)return res.status(404).json({error:{code:'MEMBER_NOT_FOUND',message:'Active agency member was not found'}});
  if(target.role==='owner')return res.status(409).json({error:{code:'OWNER_ROLE_IMMUTABLE',message:'Transfer ownership through a dedicated ownership-transfer workflow'}});
  if(agency.role==='admin'&&(target.role==='admin'||parsed.data.role==='admin'))return res.status(403).json({error:{code:'ROLE_CHANGE_FORBIDDEN',message:'Admins may only manage agent and viewer memberships'}});
  const updated=await agencyRepository.updateMemberRole(agency.id,userId,parsed.data.role,req.principal!.id);
  return updated?res.json({data:updated}):res.status(404).json({error:{code:'MEMBER_NOT_FOUND',message:'Active agency member was not found'}});
 }catch(error){
  if(error instanceof Error&&error.message==='PERSISTENCE_REQUIRED')return res.status(503).json({error:{code:'PERSISTENCE_REQUIRED',message:'Agency membership administration requires PostgreSQL persistence'}});
  if(error instanceof Error&&error.message==='OWNER_ROLE_IMMUTABLE')return res.status(409).json({error:{code:'OWNER_ROLE_IMMUTABLE',message:'The agency owner role cannot be changed'}});
  if(error instanceof Error&&error.message==='ROLE_CHANGE_FORBIDDEN')return res.status(403).json({error:{code:'ROLE_CHANGE_FORBIDDEN',message:'Admins may only manage agent and viewer memberships'}});
  if(error instanceof Error&&error.message==='ACTOR_NOT_AUTHORIZED')return res.status(403).json({error:{code:'FORBIDDEN',message:'Your agency membership does not permit this operation'}});
  throw error;
 }
});
app.delete('/api/v1/agencies/members/:userId',authenticate,async(req,res)=>{
 const agency=await resolveActiveAgency(req,res);if(!agency)return;
 if(!['owner','admin'].includes(agency.role))return res.status(403).json({error:{code:'FORBIDDEN',message:'Agency owner or admin permission is required'}});
 const userId=String(req.params.userId);
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId))return res.status(404).json({error:{code:'MEMBER_NOT_FOUND',message:'Active agency member was not found'}});
 if(userId===req.principal!.id)return res.status(409).json({error:{code:'SELF_REMOVAL_BLOCKED',message:'You cannot remove your own agency membership'}});
 try{
  const members=await agencyRepository.listMembers(agency.id);
  const target=members.find(member=>member.userId===userId&&member.status==='active');
  if(!target)return res.status(404).json({error:{code:'MEMBER_NOT_FOUND',message:'Active agency member was not found'}});
  if(target.role==='owner')return res.status(409).json({error:{code:'LAST_OWNER_PROTECTED',message:'The agency owner cannot be removed'}});
  if(agency.role==='admin'&&target.role==='admin')return res.status(403).json({error:{code:'MEMBER_REMOVAL_FORBIDDEN',message:'Admins may only remove agents and viewers'}});
  const removed=await agencyRepository.removeMember(agency.id,userId,req.principal!.id);
  return removed?res.status(204).end():res.status(404).json({error:{code:'MEMBER_NOT_FOUND',message:'Active agency member was not found'}});
 }catch(error){
  if(error instanceof Error&&error.message==='PERSISTENCE_REQUIRED')return res.status(503).json({error:{code:'PERSISTENCE_REQUIRED',message:'Agency membership administration requires PostgreSQL persistence'}});
  if(error instanceof Error&&error.message==='LAST_OWNER_PROTECTED')return res.status(409).json({error:{code:'LAST_OWNER_PROTECTED',message:'The agency owner cannot be removed'}});
  if(error instanceof Error&&error.message==='MEMBER_REMOVAL_FORBIDDEN')return res.status(403).json({error:{code:'MEMBER_REMOVAL_FORBIDDEN',message:'Admins may only remove agents and viewers'}});
  if(error instanceof Error&&error.message==='ACTOR_NOT_AUTHORIZED')return res.status(403).json({error:{code:'FORBIDDEN',message:'Your agency membership does not permit this operation'}});
  throw error;
 }
});
app.post('/api/v1/agencies/invitations',authenticate,async(req,res)=>{
 const agency=await resolveActiveAgency(req,res);if(!agency)return;
 if(!['owner','admin'].includes(agency.role))return res.status(403).json({error:{code:'FORBIDDEN',message:'Agency owner or admin permission is required'}});
 const parsed=invitationCreateSchema.safeParse(req.body);
 if(!parsed.success)return res.status(400).json({error:{code:'VALIDATION_ERROR',message:'Invitation email or role is invalid'}});
 try{
  const created=await agencyInvitationRepository.create(agency.id,req.principal!.id,parsed.data.email,parsed.data.role as InvitationRole);
  return res.status(201).json({data:{...created.invitation,token:created.token,delivery:'manual'}});
 }catch(error){
  if(error instanceof Error&&error.message==='PERSISTENCE_REQUIRED')return res.status(503).json({error:{code:'PERSISTENCE_REQUIRED',message:'Agency invitations require PostgreSQL persistence'}});
  if(error instanceof Error&&error.message==='INVITATION_ALREADY_PENDING')return res.status(409).json({error:{code:'INVITATION_ALREADY_PENDING',message:'An active invitation already exists for this email'}});
  throw error;
 }
});
app.post('/api/v1/agencies/invitations/accept',authenticate,async(req,res)=>{
 const parsed=invitationAcceptSchema.safeParse(req.body);
 if(!parsed.success)return res.status(400).json({error:{code:'VALIDATION_ERROR',message:'A valid invitation token is required'}});
 try{
  const membership=await agencyInvitationRepository.accept(parsed.data.token,req.principal!.id,req.principal!.email);
  return res.status(200).json({data:membership});
 }catch(error){
  if(error instanceof Error&&error.message==='PERSISTENCE_REQUIRED')return res.status(503).json({error:{code:'PERSISTENCE_REQUIRED',message:'Agency invitations require PostgreSQL persistence'}});
  if(error instanceof Error&&error.message==='INVITATION_EMAIL_MISMATCH')return res.status(403).json({error:{code:'INVITATION_EMAIL_MISMATCH',message:'Sign in with the email address this invitation was sent to'}});
  if(error instanceof Error&&error.message==='INVITATION_INVALID')return res.status(400).json({error:{code:'INVITATION_INVALID',message:'Invitation is invalid, expired, revoked, or already accepted'}});
  if(error instanceof Error&&error.message==='MEMBERSHIP_ALREADY_ACTIVE')return res.status(409).json({error:{code:'MEMBERSHIP_ALREADY_ACTIVE',message:'You already have an active membership in this agency'}});
  throw error;
 }
});
app.delete('/api/v1/agencies/invitations/:id',authenticate,async(req,res)=>{
 const agency=await resolveActiveAgency(req,res);if(!agency)return;
 if(!['owner','admin'].includes(agency.role))return res.status(403).json({error:{code:'FORBIDDEN',message:'Agency owner or admin permission is required'}});
 const id=String(req.params.id);
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))return res.status(404).json({error:{code:'INVITATION_NOT_FOUND',message:'Invitation was not found'}});
 try{
  const revoked=await agencyInvitationRepository.revoke(agency.id,id,req.principal!.id);
  return revoked?res.status(204).end():res.status(404).json({error:{code:'INVITATION_NOT_FOUND',message:'Pending invitation was not found in this agency'}});
 }catch(error){
  if(error instanceof Error&&error.message==='PERSISTENCE_REQUIRED')return res.status(503).json({error:{code:'PERSISTENCE_REQUIRED',message:'Agency invitations require PostgreSQL persistence'}});
  throw error;
 }
});
app.get('/api/v1/properties',publicSearchRateLimit,async(req,res)=>{const parsed=propertyQuerySchema.safeParse(req.query);if(!parsed.success)return res.status(400).json({error:{code:'VALIDATION_ERROR',message:'Query parameters are invalid',details:parsed.error.flatten()}});const result=await propertyRepository.list(parsed.data);return res.json({data:{...result,items:result.items.map(toPublicProperty)}});});
app.get('/api/v1/properties/:id',async(req,res)=>{const p=await propertyRepository.getById(String(req.params.id));if(!p)return res.status(404).json({error:{code:'PROPERTY_NOT_FOUND',message:'Property was not found'}});return res.json({data:toPublicProperty(p)});});

// Administrator-only image uploads. Images are stored in PostgreSQL, not on the
// ephemeral Render filesystem, and are served through immutable public URLs.
const imageUploadParser=express.raw({type:['image/jpeg','image/png','image/webp'],limit:'5mb'});
app.post('/api/v1/media',authenticate,imageUploadParser,async(req,res)=>{
 if(req.principal?.role!=='admin')return res.status(403).json({error:{code:'FORBIDDEN',message:'Administrator permission is required to upload images'}});
 if(!pool)return res.status(503).json({error:{code:'STORAGE_UNAVAILABLE',message:'Persistent image storage is not configured'}});
 if(!Buffer.isBuffer(req.body)||req.body.length===0)return res.status(400).json({error:{code:'INVALID_IMAGE',message:'Select a non-empty JPG, PNG or WebP image'}});
 const body=req.body as Buffer;
 const declared=String(req.headers['content-type']||'').split(';')[0]?.toLowerCase();
 const isJpeg=body.length>=3&&body[0]===0xff&&body[1]===0xd8&&body[2]===0xff;
 const isPng=body.length>=8&&body.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
 const isWebp=body.length>=12&&body.toString('ascii',0,4)==='RIFF'&&body.toString('ascii',8,12)==='WEBP';
 const actual=isJpeg?'image/jpeg':isPng?'image/png':isWebp?'image/webp':null;
 if(!actual||actual!==declared)return res.status(415).json({error:{code:'UNSUPPORTED_IMAGE',message:'Only valid JPG, PNG and WebP images are accepted'}});
 const id=randomUUID();
 await pool.query('INSERT INTO media_assets(id,content_type,data,byte_size) VALUES($1,$2,$3,$4)',[id,actual,body,body.length]);
 return res.status(201).json({data:{id,url:`/api/v1/media/${id}`,contentType:actual,size:body.length}});
});
app.get('/api/v1/media/:id',async(req,res)=>{
 const id=String(req.params.id);
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))return res.status(404).end();
 if(!pool)return res.status(404).end();
 const result=await pool.query<{content_type:string,data:Buffer}>('SELECT content_type,data FROM media_assets WHERE id=$1',[id]);
 const asset=result.rows[0];if(!asset)return res.status(404).end();
 res.setHeader('Content-Type',asset.content_type);res.setHeader('Content-Length',asset.data.length);
 res.setHeader('Cache-Control','public, max-age=31536000, immutable');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Cross-Origin-Resource-Policy','cross-origin');
 return res.status(200).send(asset.data);
});
app.post('/api/v1/properties',authenticate,async(req,res)=>{const agency=await resolveActiveAgency(req,res);if(!agency)return;if(!['owner','admin','agent'].includes(agency.role))return res.status(403).json({error:{code:'FORBIDDEN',message:'Agency listing permission is required'}});const parsed=propertyInputSchema.safeParse(req.body);if(!parsed.success)return res.status(400).json({error:{code:'VALIDATION_ERROR',message:'Property payload is invalid',details:parsed.error.flatten()}});const p=await propertyRepository.create(parsed.data,req.principal!.id,agency.id);return res.status(201).location(`/api/v1/properties/${p.id}`).json({data:toPublicProperty(p)});});
app.patch('/api/v1/properties/:id',authenticate,async(req,res)=>{const agency=await resolveActiveAgency(req,res);if(!agency)return;const current=await propertyRepository.getById(String(req.params.id),agency.id);if(!current)return res.status(404).json({error:{code:'PROPERTY_NOT_FOUND',message:'Property was not found in this agency'}});if(!(agency.role==='owner'||agency.role==='admin'||(agency.role==='agent'&&current.ownerId===req.principal!.id)))return res.status(403).json({error:{code:'FORBIDDEN',message:'You may only modify listings permitted by your agency role'}});const parsed=propertyInputSchema.safeParse(req.body);if(!parsed.success)return res.status(400).json({error:{code:'VALIDATION_ERROR',message:'Property payload is invalid',details:parsed.error.flatten()}});const updated=await propertyRepository.update(String(req.params.id),parsed.data,agency.id,req.principal!.id);return updated?res.json({data:toPublicProperty(updated)}):res.status(404).json({error:{code:'PROPERTY_NOT_FOUND',message:'Property was not found in this agency'}});});
app.patch('/api/v1/properties/:id/publication',authenticate,async(req,res)=>{
 const agency=await resolveActiveAgency(req,res);if(!agency)return;
 if(!['owner','admin'].includes(agency.role))return res.status(403).json({error:{code:'FORBIDDEN',message:'Only agency owners and admins can change publication status'}});
 const parsed=z.object({status:z.enum(['draft','published','archived'])}).strict().safeParse(req.body);
 if(!parsed.success)return res.status(400).json({error:{code:'VALIDATION_ERROR',message:'Status must be draft, published or archived'}});
 try{
  const updated=await propertyRepository.setPublicationStatus(String(req.params.id),agency.id,parsed.data.status,req.principal!.id);
  return updated?res.json({data:toPublicProperty(updated)}):res.status(404).json({error:{code:'PROPERTY_NOT_FOUND',message:'Property was not found in this agency'}});
 }catch(error){
  if(error instanceof Error&&error.message==='PERSISTENCE_REQUIRED')return res.status(503).json({error:{code:'PERSISTENCE_REQUIRED',message:'Publication controls require PostgreSQL persistence'}});
  throw error;
 }
});
app.delete('/api/v1/properties/:id',authenticate,async(req,res)=>{const agency=await resolveActiveAgency(req,res);if(!agency)return;const current=await propertyRepository.getById(String(req.params.id),agency.id);if(!current)return res.status(404).json({error:{code:'PROPERTY_NOT_FOUND',message:'Property was not found in this agency'}});if(!(agency.role==='owner'||agency.role==='admin'||(agency.role==='agent'&&current.ownerId===req.principal!.id)))return res.status(403).json({error:{code:'FORBIDDEN',message:'You may only delete listings permitted by your agency role'}});if(!await propertyRepository.delete(String(req.params.id),agency.id,req.principal!.id))return res.status(404).json({error:{code:'PROPERTY_NOT_FOUND',message:'Property was not found in this agency'}});return res.status(204).end();});
app.post('/api/v1/inquiries',inquiryRateLimit,async(req,res)=>{const parsed=inquiryInputSchema.safeParse(req.body);if(!parsed.success)return res.status(400).json({error:{code:'VALIDATION_ERROR',message:'Inquiry payload is invalid',details:parsed.error.flatten()}});try{return res.status(201).json({data:await inquiryRepository.create(parsed.data)});}catch(error){if(error instanceof Error&&error.message==='AGENCY_NOT_FOUND')return res.status(400).json({error:{code:'AGENCY_NOT_FOUND',message:'The selected agency is not active or does not exist'}});if(error instanceof Error&&error.message==='LISTING_NOT_FOUND')return res.status(404).json({error:{code:'LISTING_NOT_FOUND',message:'The listing is not published or does not exist'}});throw error;}});
app.get('/api/v1/inquiries',authenticate,async(req,res)=>{const memberships=await agencyRepository.listForUser(req.principal!.id);if(!memberships.some(m=>m.status==='active'))return res.status(403).json({error:{code:'FORBIDDEN',message:'Active agency membership is required to access the enquiry inbox'}});const agency=await resolveActiveAgency(req,res);if(!agency)return;if(!['owner','admin'].includes(agency.role))return res.status(403).json({error:{code:'FORBIDDEN',message:'Agency owner or admin permission is required'}});return res.json({data:{items:await inquiryRepository.list(100,agency.id)}});});
app.use('/demo',express.static(resolve(process.cwd(),'public/demo'),{index:'index.html'}));
app.use((_req,res)=>res.status(404).json({error:{code:'NOT_FOUND',message:'Route was not found'}}));
app.use((error:unknown,_req:express.Request,res:express.Response,next:express.NextFunction)=>{
 void next;app.emit('application-error',error);if(res.headersSent)return;
 const status=typeof error==='object'&&error!==null&&'status'in error&&typeof (error as {status?:unknown}).status==='number'?(error as {status:number}).status:500;
 if(status===413)return res.status(413).json({error:{code:'PAYLOAD_TOO_LARGE',message:'Request body exceeds the 1 MiB limit'}});
 if(status===400)return res.status(400).json({error:{code:'INVALID_REQUEST',message:'Request body is malformed or invalid'}});
 return res.status(500).json({error:{code:'INTERNAL_ERROR',message:'An unexpected error occurred'}});
});
