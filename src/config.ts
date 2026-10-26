import 'dotenv/config';
import { z } from 'zod';
const schema=z.object({NODE_ENV:z.enum(['development','test','production']).default('development'),PORT:z.coerce.number().int().min(1).max(65535).default(3000),LOG_LEVEL:z.enum(['fatal','error','warn','info','debug','trace','silent']).default('info'),CORS_ORIGIN:z.string().default('http://localhost:3000'),DATABASE_URL:z.string().url().optional(),JWT_SECRET:z.string().min(32).default('development-only-secret-change-before-production-123456'),JWT_TTL_SECONDS:z.coerce.number().int().min(300).max(86400).default(3600)});
const parsed=schema.safeParse(process.env);if(!parsed.success)throw new Error(`Invalid environment configuration: ${parsed.error.issues.map(i=>`${i.path.join('.')}: ${i.message}`).join('; ')}`);
if(parsed.data.NODE_ENV==='production'&&(!parsed.data.DATABASE_URL||parsed.data.JWT_SECRET==='development-only-secret-change-before-production-123456'))throw new Error('Production requires DATABASE_URL and a unique JWT_SECRET');
export const config=Object.freeze(parsed.data);
