import 'dotenv/config';
import { z } from 'zod';
const schema=z.object({
 NODE_ENV:z.enum(['development','test','production']).default('development'),
 PORT:z.coerce.number().int().min(1).max(65535).default(3000),
 LOG_LEVEL:z.enum(['fatal','error','warn','info','debug','trace','silent']).default('info'),
 CORS_ORIGIN:z.string().default('http://localhost:3000'),
 DATABASE_URL:z.string().url().optional(),
 MIGRATION_DATABASE_URL:z.string().url().optional(),
 JWT_SECRET:z.string().min(32).default('development-only-secret-change-before-production-123456'),
 JWT_TTL_SECONDS:z.coerce.number().int().min(300).max(86400).default(3600),
 ADMIN_BOOTSTRAP_TOKEN:z.string().min(32).optional(),
 MPESA_ENV:z.enum(['sandbox','production']).default('sandbox'),
 MPESA_CONSUMER_KEY:z.string().min(1).optional(),
 MPESA_CONSUMER_SECRET:z.string().min(1).optional(),
 MPESA_SHORTCODE:z.string().regex(/^\d{5,7}$/).optional(),
 MPESA_PASSKEY:z.string().min(1).optional(),
 MPESA_CALLBACK_BASE_URL:z.string().url().optional(),
 MPESA_CALLBACK_SECRET:z.string().regex(/^[A-Za-z0-9_-]{32,128}$/).optional(),\n EMAIL_API_URL:z.string().url().optional(),\n EMAIL_API_KEY:z.string().min(1).optional(),\n EMAIL_FROM:z.string().email().optional(),\n PUBLIC_APP_URL:z.string().url().optional()
});
const parsed=schema.safeParse(process.env);
if(!parsed.success)throw new Error('Invalid environment configuration: '+parsed.error.issues.map(i=>i.path.join('.')+': '+i.message).join('; '));
if(parsed.data.NODE_ENV==='test'&&!parsed.data.ADMIN_BOOTSTRAP_TOKEN)parsed.data.ADMIN_BOOTSTRAP_TOKEN='test-only-bootstrap-token-never-use-in-production-123456';
if(parsed.data.NODE_ENV==='production'&&(!parsed.data.DATABASE_URL||parsed.data.JWT_SECRET==='development-only-secret-change-before-production-123456'))throw new Error('Production requires DATABASE_URL and a unique JWT_SECRET');
const mpesaFields=[parsed.data.MPESA_CONSUMER_KEY,parsed.data.MPESA_CONSUMER_SECRET,parsed.data.MPESA_SHORTCODE,parsed.data.MPESA_PASSKEY,parsed.data.MPESA_CALLBACK_BASE_URL,parsed.data.MPESA_CALLBACK_SECRET];
const mpesaAny=mpesaFields.some(Boolean);
const mpesaAll=mpesaFields.every(Boolean);
if(mpesaAny&&!mpesaAll)throw new Error('M-Pesa requires consumer key, consumer secret, shortcode, passkey, callback base URL, and callback secret');
if(mpesaAll){
 if(!parsed.data.MPESA_CALLBACK_BASE_URL?.startsWith('https://'))throw new Error('M-Pesa callback URL must use HTTPS');
 const callbackUrl=new URL(parsed.data.MPESA_CALLBACK_BASE_URL);
 if(callbackUrl.pathname!=='/'||callbackUrl.search||callbackUrl.hash)throw new Error('M-Pesa callback base URL must be an origin without a path, query, or fragment');
}
export const config=Object.freeze(parsed.data);

const emailFields=[parsed.data.EMAIL_API_URL,parsed.data.EMAIL_API_KEY,parsed.data.EMAIL_FROM,parsed.data.PUBLIC_APP_URL];
if(emailFields.some(Boolean)&&!emailFields.every(Boolean))throw new Error('Password recovery email requires EMAIL_API_URL, EMAIL_API_KEY, EMAIL_FROM, and PUBLIC_APP_URL together');
if(parsed.data.NODE_ENV==='production'&&parsed.data.EMAIL_API_URL&&!parsed.data.EMAIL_API_URL.startsWith('https://'))throw new Error('EMAIL_API_URL must use HTTPS in production');
if(parsed.data.NODE_ENV==='production'&&parsed.data.PUBLIC_APP_URL&&!parsed.data.PUBLIC_APP_URL.startsWith('https://'))throw new Error('PUBLIC_APP_URL must use HTTPS in production');
