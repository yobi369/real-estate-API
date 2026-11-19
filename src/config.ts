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
 MPESA_SHORTCODE:z.string().regex(/^\\d{5,7}$/).optional(),
 MPESA_PASSKEY:z.string().min(1).optional(),
 MPESA_CALLBACK_BASE_URL:z.string().url().optional(),
 MPESA_CALLBACK_SECRET:z.string().min(32).optional()
});
const parsed=schema.safeParse(process.env);
if(!parsed.success)throw new Error('Invalid environment configuration: '+parsed.error.issues.map(i=>i.path.join('.')+': '+i.message).join('; '));
if(parsed.data.NODE_ENV==='test'&&!parsed.data.ADMIN_BOOTSTRAP_TOKEN)parsed.data.ADMIN_BOOTSTRAP_TOKEN='test-only-bootstrap-token-never-use-in-production-123456';
if(parsed.data.NODE_ENV==='production'&&(!parsed.data.DATABASE_URL||parsed.data.JWT_SECRET==='development-only-secret-change-before-production-123456'))throw new Error('Production requires DATABASE_URL and a unique JWT_SECRET');
const mpesaFields=[parsed.data.MPESA_CONSUMER_KEY,parsed.data.MPESA_CONSUMER_SECRET,parsed.data.MPESA_SHORTCODE,parsed.data.MPESA_PASSKEY,parsed.data.MPESA_CALLBACK_BASE_URL,parsed.data.MPESA_CALLBACK_SECRET];
const mpesaAny=mpesaFields.some(Boolean);
const mpesaAll=mpesaFields.every(Boolean);
if(mpesaAny&&!mpesaAll)throw new Error('M-Pesa requires consumer key, consumer secret, shortcode, passkey, callback base URL, and callback secret');
if(parsed.data.NODE_ENV==='production'&&mpesaAll&&!parsed.data.MPESA_CALLBACK_BASE_URL?.startsWith('https://'))throw new Error('Production M-Pesa callback URL must use HTTPS');
export const config=Object.freeze(parsed.data);
