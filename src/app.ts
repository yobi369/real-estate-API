import express from 'express';
import { resolve } from 'node:path';
import cors from 'cors';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import swaggerUi from 'swagger-ui-express';
import { randomUUID } from 'node:crypto';
import { config } from './config.js';
import { propertyInputSchema,propertyQuerySchema } from './domain/property.js';
import { PropertyRepository } from './repositories/property-repository.js';
import { demoProperties } from './demo-data.js';
import { pool } from './db.js';
import { authenticate,loginUser,registerUser,requireOwnerOrAdmin } from './auth.js';
export const app=express();export const propertyRepository=new PropertyRepository();
app.disable('x-powered-by');app.use(helmet());app.use(cors({origin:config.CORS_ORIGIN.split(',').map(v=>v.trim()),credentials:false}));app.use(express.json({limit:'1mb',strict:true}));app.use(pinoHttp({level:config.LOG_LEVEL,genReqId:(req,res)=>{const h=req.headers['x-request-id'];const id=typeof h==='string'&&/^[a-zA-Z0-9._-]{1,100}$/.test(h)?h:randomUUID();res.setHeader('x-request-id',id);return id;},redact:['req.headers.authorization','req.headers.cookie']}));
const spec={
 openapi:'3.1.0',
 info:{title:'Real Estate API',version:'1.1.0',description:'Property inventory and discovery API. Public listing reads; authenticated listing management. Use fictional records in the interactive demo.'},
 servers:[{url:'/'}],
 tags:[{name:'Properties',description:'Search and manage property listings.'},{name:'Authentication',description:'Register and authenticate listing operators.'},{name:'Health',description:'Service health and readiness.'}],
 paths:{
  '/health/live':{get:{tags:['Health'],summary:'Check process liveness',responses:{'200':{description:'Process is alive'}}}},
  '/health/ready':{get:{tags:['Health'],summary:'Check database readiness',responses:{'200':{description:'Database is ready'},'503':{description:'Database unavailable or not configured'}}}},
  '/api/v1/auth/register':{post:{tags:['Authentication'],summary:'Register a listing operator',requestBody:{required:true,content:{'application/json':{schema:{type:'object',required:['email','password'],properties:{email:{type:'string',format:'email'},password:{type:'string',minLength:12,description:'At least 12 characters with lowercase, uppercase and a number.'}}}}}},responses:{'201':{description:'Account created; bearer token returned'},'400':{description:'Invalid registration input'},'409':{description:'Email already registered'}}}},
  '/api/v1/auth/login':{post:{tags:['Authentication'],summary:'Authenticate a listing operator',requestBody:{required:true,content:{'application/json':{schema:{type:'object',required:['email','password'],properties:{email:{type:'string',format:'email'},password:{type:'string'}}}}}},responses:{'200':{description:'Authenticated; bearer token returned'},'401':{description:'Invalid credentials'}}}},
  '/api/v1/properties':{
   get:{tags:['Properties'],summary:'Search public property listings',description:'Returns a paginated list. Filters can be combined.',parameters:[
    {name:'page',in:'query',schema:{type:'integer',minimum:1,default:1}},
    {name:'limit',in:'query',schema:{type:'integer',minimum:1,maximum:100,default:20}},
    {name:'city',in:'query',schema:{type:'string'}},
    {name:'propertyType',in:'query',schema:{type:'string',enum:['apartment','house','land','commercial']}},
    {name:'transactionType',in:'query',schema:{type:'string',enum:['sale','rent','lease']}},
    {name:'minPrice',in:'query',schema:{type:'number',minimum:0}},
    {name:'maxPrice',in:'query',schema:{type:'number',minimum:0}},
    {name:'search',in:'query',schema:{type:'string',maxLength:120}}
   ],responses:{'200':{description:'Paginated listing results'},'400':{description:'Invalid search parameters'}}},
   post:{tags:['Properties'],summary:'Create a property listing',description:'Requires a bearer token. The owner is derived from the authenticated identity.',security:[{bearerAuth:[]}],requestBody:{required:true,content:{'application/json':{schema:{$ref:'#/components/schemas/PropertyInput'}}}},responses:{'201':{description:'Listing created'},'400':{description:'Invalid listing data'},'401':{description:'Authentication required'}}}
  },
  '/api/v1/properties/{id}':{
   parameters:[{name:'id',in:'path',required:true,schema:{type:'string',format:'uuid'}}],
   get:{tags:['Properties'],summary:'Retrieve one public listing',responses:{'200':{description:'Listing found'},'404':{description:'Listing not found'}}},
   patch:{tags:['Properties'],summary:'Replace an owned listing',description:'Requires a bearer token and owner or admin permission. Currently accepts the complete validated property object.',security:[{bearerAuth:[]}],requestBody:{required:true,content:{'application/json':{schema:{$ref:'#/components/schemas/PropertyInput'}}}},responses:{'200':{description:'Listing updated'},'400':{description:'Invalid listing data'},'403':{description:'Not the listing owner'},'404':{description:'Listing not found'}}},
   delete:{tags:['Properties'],summary:'Delete an owned listing',security:[{bearerAuth:[]}],responses:{'204':{description:'Listing deleted'},'403':{description:'Not the listing owner'},'404':{description:'Listing not found'}}}
  }
 },
 components:{
  securitySchemes:{bearerAuth:{type:'http',scheme:'bearer',bearerFormat:'JWT'}},
  schemas:{PropertyInput:{type:'object',additionalProperties:false,required:['title','description','price','propertyType','transactionType','city'],properties:{title:{type:'string',minLength:3,maxLength:120},description:{type:'string',minLength:1,maxLength:5000},price:{type:'number',exclusiveMinimum:0,maximum:1000000000},currency:{type:'string',enum:['KES','USD','GBP'],default:'KES'},propertyType:{type:'string',enum:['apartment','house','land','commercial']},transactionType:{type:'string',enum:['sale','rent','lease']},bedrooms:{type:'integer',minimum:0,maximum:100,default:0},bathrooms:{type:'integer',minimum:0,maximum:100,default:0},city:{type:'string',minLength:1,maxLength:100},country:{type:'string',default:'Kenya'},imageUrls:{type:'array',maxItems:20,items:{type:'string',format:'uri'}}}}}
 }
};
app.get('/health/live',(_req,res)=>res.json({status:'ok',service:'real-estate-api'}));
app.get('/health/ready',async(_req,res)=>{if(!pool)return res.status(503).json({status:'degraded',persistence:'in-memory-development-adapter'});try{await pool.query('SELECT 1');return res.status(200).json({status:'ready',persistence:'postgresql'});}catch{return res.status(503).json({status:'degraded',persistence:'postgresql'});}});
app.get('/demo/properties',(req,res)=>{const parsed=propertyQuerySchema.safeParse(req.query);if(!parsed.success)return res.status(400).json({error:{code:'VALIDATION_ERROR',message:'Query parameters are invalid'}});const q=parsed.data;const needle=q.search?.toLocaleLowerCase();const matches=demoProperties.filter(p=>(!q.city||p.city.toLocaleLowerCase()===q.city.toLocaleLowerCase())&&(!q.propertyType||p.propertyType===q.propertyType)&&(!q.transactionType||p.transactionType===q.transactionType)&&(q.minPrice===undefined||p.price>=q.minPrice)&&(q.maxPrice===undefined||p.price<=q.maxPrice)&&(!needle||`${p.title} ${p.description} ${p.city}`.toLocaleLowerCase().includes(needle))).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));const start=(q.page-1)*q.limit;return res.json({data:{items:matches.slice(start,start+q.limit),total:matches.length,page:q.page,limit:q.limit,notice:'Fictional sample data for demonstration only. Not live property listings.'}});});
app.get('/openapi.json',(_req,res)=>res.json(spec));app.use('/docs',swaggerUi.serve,swaggerUi.setup(spec));
app.post('/api/v1/auth/register',async(req,res)=>{const result=await registerUser(req.body);if('error'in result)return res.status(result.error==='EXISTS'?409:400).json({error:{code:result.error==='EXISTS'?'EMAIL_EXISTS':'VALIDATION_ERROR',message:result.error==='EXISTS'?'An account with this email already exists':'Email or password does not meet requirements'}});return res.status(201).json({data:{user:result.principal,token:result.token,tokenType:'Bearer',expiresIn:config.JWT_TTL_SECONDS}});});
app.post('/api/v1/auth/login',async(req,res)=>{const result=await loginUser(req.body);if(!result)return res.status(401).json({error:{code:'INVALID_CREDENTIALS',message:'Email or password is incorrect'}});return res.json({data:{user:result.principal,token:result.token,tokenType:'Bearer',expiresIn:config.JWT_TTL_SECONDS}});});
app.get('/api/v1/properties',async(req,res)=>{const parsed=propertyQuerySchema.safeParse(req.query);if(!parsed.success)return res.status(400).json({error:{code:'VALIDATION_ERROR',message:'Query parameters are invalid',details:parsed.error.flatten()}});return res.json({data:await propertyRepository.list(parsed.data)});});
app.get('/api/v1/properties/:id',async(req,res)=>{const p=await propertyRepository.getById(String(req.params.id));if(!p)return res.status(404).json({error:{code:'PROPERTY_NOT_FOUND',message:'Property was not found'}});return res.json({data:p});});
app.post('/api/v1/properties',authenticate,async(req,res)=>{const parsed=propertyInputSchema.safeParse(req.body);if(!parsed.success)return res.status(400).json({error:{code:'VALIDATION_ERROR',message:'Property payload is invalid',details:parsed.error.flatten()}});const p=await propertyRepository.create(parsed.data,req.principal!.id);return res.status(201).location(`/api/v1/properties/${p.id}`).json({data:p});});
app.patch('/api/v1/properties/:id',authenticate,async(req,res)=>{const current=await propertyRepository.getById(String(req.params.id));if(!current)return res.status(404).json({error:{code:'PROPERTY_NOT_FOUND',message:'Property was not found'}});if(!requireOwnerOrAdmin(current.ownerId,req.principal!))return res.status(403).json({error:{code:'FORBIDDEN',message:'You may only modify your own listings'}});const parsed=propertyInputSchema.safeParse(req.body);if(!parsed.success)return res.status(400).json({error:{code:'VALIDATION_ERROR',message:'Property payload is invalid',details:parsed.error.flatten()}});const updated=await propertyRepository.update(String(req.params.id),parsed.data);return res.json({data:updated});});
app.delete('/api/v1/properties/:id',authenticate,async(req,res)=>{const current=await propertyRepository.getById(String(req.params.id));if(!current)return res.status(404).json({error:{code:'PROPERTY_NOT_FOUND',message:'Property was not found'}});if(!requireOwnerOrAdmin(current.ownerId,req.principal!))return res.status(403).json({error:{code:'FORBIDDEN',message:'You may only delete your own listings'}});await propertyRepository.delete(String(req.params.id));return res.status(204).end();});
app.use('/demo',express.static(resolve(process.cwd(),'public/demo'),{index:'index.html'}));
app.use((_req,res)=>res.status(404).json({error:{code:'NOT_FOUND',message:'Route was not found'}}));
app.use((error:unknown,_req:express.Request,res:express.Response,next:express.NextFunction)=>{void next;app.emit('application-error',error);if(res.headersSent)return;return res.status(500).json({error:{code:'INTERNAL_ERROR',message:'An unexpected error occurred'}});});
