import 'dotenv/config';
import { z } from 'zod';
const schema = z.object({ NODE_ENV: z.enum(['development','test','production']).default('development'), PORT: z.coerce.number().int().min(1).max(65535).default(3000), LOG_LEVEL: z.enum(['fatal','error','warn','info','debug','trace','silent']).default('info'), CORS_ORIGIN: z.string().default('http://localhost:3000') });
const parsed = schema.safeParse(process.env);
if (!parsed.success) throw new Error(`Invalid environment configuration: ${parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
export const config = Object.freeze(parsed.data);
