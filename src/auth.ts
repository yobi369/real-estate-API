import { createHash,createHmac,randomBytes,randomUUID,scrypt as scryptCallback,timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import type { Request,Response,NextFunction } from 'express';
import { z } from 'zod';
import { config } from './config.js';
import { pool } from './db.js';
import { passwordResetUrl,sendPasswordResetEmail } from './services/email.js';
const scrypt=promisify(scryptCallback);
export type Role='user'|'admin';
export type Principal={id:string,email:string,role:Role};
type TokenClaims={sub:string;email:string;role:Role;iat:number;exp:number;jti:string};
type SessionRecord={principal:Principal;createdAt:string;expiresAt:string;revokedAt:string|null};
// Express request augmentation uses TypeScript declaration merging.
// eslint-disable-next-line @typescript-eslint/no-namespace
declare global { namespace Express { interface Request { principal?: Principal; authSessionId?: string } } }
const registration=z.object({email:z.string().trim().email().max(254).transform(v=>v.toLowerCase()),password:z.string().min(12).max(128).regex(/[a-z]/,'Password must include a lowercase letter').regex(/[A-Z]/,'Password must include an uppercase letter').regex(/[0-9]/,'Password must include a number')}).strict();
const loginSchema=z.object({email:z.string().trim().email().max(254).transform(v=>v.toLowerCase()),password:z.string().min(1).max(128)}).strict();
const memoryUsers=new Map<string,{id:string,email:string,passwordHash:string,role:Role}>();
const memorySessions=new Map<string,SessionRecord>();
const memoryLoginAttempts=new Map<string,{failures:number;lockedUntil:number|null}>();
const memoryResetTokens=new Map<string,{userId:string;expiresAt:number;consumed:boolean}>();
const RESET_TOKEN_TTL_SECONDS=30*60;
const LOGIN_FAILURE_LIMIT=8;
const LOGIN_LOCKOUT_SECONDS=15*60;
const digestAccount=(email:string)=>createHmac('sha256',config.JWT_SECRET).update('login:').update(email).digest('hex');
const digestResetToken=(token:string)=>createHash('sha256').update(token).digest('hex');
async function hashPassword(password:string):Promise<string>{const salt=randomUUID().replaceAll('-','');const key=await scrypt(password,salt,64) as Buffer;return salt+':'+key.toString('hex');}
async function verifyPassword(password:string,stored:string):Promise<boolean>{const [salt,hex]=stored.split(':');if(!salt||!hex||!/^[a-f0-9]{128}$/i.test(hex))return false;const expected=Buffer.from(hex,'hex');const actual=await scrypt(password,salt,expected.length) as Buffer;return actual.length===expected.length&&timingSafeEqual(actual,expected);}
function signToken(principal:Principal,sessionId:string,expiresAt:number):string{const b64=(v:unknown)=>Buffer.from(JSON.stringify(v)).toString('base64url');const now=Math.floor(Date.now()/1000);const header=b64({alg:'HS256',typ:'JWT'});const payload=b64({sub:principal.id,email:principal.email,role:principal.role,iat:now,exp:expiresAt,jti:sessionId});const body=header+'.'+payload;return body+'.'+createHmac('sha256',config.JWT_SECRET).update(body).digest('base64url');}
function decodeToken(token:string):TokenClaims|null{try{const parts=token.split('.');if(parts.length!==3)return null;const [h,p,s]=parts as [string,string,string];const expected=createHmac('sha256',config.JWT_SECRET).update(h+'.'+p).digest();const received=Buffer.from(s,'base64url');if(received.length!==expected.length||!timingSafeEqual(received,expected))return null;const header=JSON.parse(Buffer.from(h,'base64url').toString()) as {alg?:string;typ?:string};const payload=JSON.parse(Buffer.from(p,'base64url').toString()) as Partial<TokenClaims>;if(header.alg!=='HS256'||header.typ!=='JWT'||typeof payload.sub!=='string'||typeof payload.email!=='string'||!['user','admin'].includes(payload.role??'')||!Number.isSafeInteger(payload.exp)||!Number.isSafeInteger(payload.iat)||typeof payload.jti!=='string'||!/^[0-9a-f-]{36}$/i.test(payload.jti)||payload.exp!<=Math.floor(Date.now()/1000)||payload.iat!>Math.floor(Date.now()/1000)+60)return null;return payload as TokenClaims;}catch{return null;}}
async function issueSession(principal:Principal):Promise<string>{const sessionId=randomUUID();const now=Math.floor(Date.now()/1000);const expiresAt=now+config.JWT_TTL_SECONDS;const createdAt=new Date(now*1000).toISOString();const expiresAtIso=new Date(expiresAt*1000).toISOString();if(pool){await pool.query('INSERT INTO auth_sessions(id,user_id,expires_at) VALUES($1,$2,to_timestamp($3))',[sessionId,principal.id,expiresAt]);}else{memorySessions.set(sessionId,{principal,createdAt,expiresAt:expiresAtIso,revokedAt:null});}return signToken(principal,sessionId,expiresAt);}
export async function listAuthSessions(userId:string,currentSessionId:string):Promise<Array<{id:string;createdAt:string;expiresAt:string;current:boolean}>>{if(pool){const result=await pool.query<{id:string;created_at:Date;expires_at:Date}>('SELECT id,created_at,expires_at FROM auth_sessions WHERE user_id=$1 AND revoked_at IS NULL AND expires_at>now() ORDER BY created_at DESC',[userId]);return result.rows.map(row=>({id:row.id,createdAt:row.created_at.toISOString(),expiresAt:row.expires_at.toISOString(),current:row.id===currentSessionId}));}return [...memorySessions.entries()].filter(([,session])=>session.principal.id===userId&&session.revokedAt===null&&Date.parse(session.expiresAt)>Date.now()).map(([id,session])=>({id,createdAt:session.createdAt,expiresAt:session.expiresAt,current:id===currentSessionId})).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));}
export async function revokeAuthSession(userId:string,sessionId:string):Promise<boolean>{if(pool){const result=await pool.query('UPDATE auth_sessions SET revoked_at=now() WHERE id=$1 AND user_id=$2 AND revoked_at IS NULL',[sessionId,userId]);return (result.rowCount??0)>0;}const session=memorySessions.get(sessionId);if(!session||session.principal.id!==userId||session.revokedAt!==null)return false;session.revokedAt=new Date().toISOString();return true;}
export async function registerUser(input:unknown):Promise<{principal:Principal,token:string}|{error:'INVALID'|'EXISTS'}>{const parsed=registration.safeParse(input);if(!parsed.success)return {error:'INVALID'};const {email,password}=parsed.data;const passwordHash=await hashPassword(password);if(pool){try{const id=randomUUID();const r=await pool.query<{id:string,email:string,role:Role}>('INSERT INTO users(id,email,password_hash,role) VALUES($1,$2,$3,$4) RETURNING id,email,role',[id,email,passwordHash,'user']);const principal=r.rows[0]!;return {principal,token:await issueSession(principal)};}catch(e){if((e as {code?:string}).code==='23505')return {error:'EXISTS'};throw e;}}
if([...memoryUsers.values()].some(u=>u.email===email))return {error:'EXISTS'};const user={id:randomUUID(),email,passwordHash,role:'user' as const};memoryUsers.set(user.id,user);const principal={id:user.id,email:user.email,role:user.role};return {principal,token:await issueSession(principal)};}
export async function bootstrapAdmin(input:unknown,token:string):Promise<{principal:Principal,token:string}|{error:'DISABLED'|'INVALID'|'EXISTS'}>{
 const configured=config.ADMIN_BOOTSTRAP_TOKEN;
 if(!configured)return {error:'DISABLED'};
 const candidate=Buffer.from(token);const expected=Buffer.from(configured);
 if(candidate.length!==expected.length||!timingSafeEqual(candidate,expected))return {error:'DISABLED'};
 const parsed=registration.safeParse(input);if(!parsed.success)return {error:'INVALID'};
 const {email,password}=parsed.data;const passwordHash=await hashPassword(password);
 if(pool){
  const client=await pool.connect();
  try{
   await client.query('BEGIN');
   await client.query('SELECT pg_advisory_xact_lock(2026111502)');
   const existing=await client.query("SELECT id FROM users WHERE role='admin' LIMIT 1");
   if(existing.rows.length){await client.query('ROLLBACK');return {error:'EXISTS'};}
   const id=randomUUID();
   const created=await client.query<{id:string,email:string,role:Role}>('INSERT INTO users(id,email,password_hash,role) VALUES($1,$2,$3,$4) RETURNING id,email,role',[id,email,passwordHash,'admin']);
   const agencyId=randomUUID();
   await client.query('INSERT INTO agencies(id,name,slug,created_by) VALUES($1,$2,$3,$4)',[agencyId,'Default Agency','default-'+id.slice(0,8),id]);
   await client.query("INSERT INTO agency_memberships(id,agency_id,user_id,role,status) VALUES($1,$2,$3,'owner','active')",[randomUUID(),agencyId,id]);
   await client.query("INSERT INTO audit_events(id,agency_id,actor_user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,$3,'agency.created','agency',$4,$5::jsonb)",[randomUUID(),agencyId,id,agencyId,JSON.stringify({source:'admin-bootstrap'})]);
   await client.query('COMMIT');
   const principal=created.rows[0]!;
   return {principal,token:await issueSession(principal)};
  }catch(error){
   await client.query('ROLLBACK');
   if((error as {code?:string}).code==='23505')return {error:'EXISTS'};
   throw error;
  }finally{client.release();}
 }
 if([...memoryUsers.values()].some(u=>u.role==='admin'||u.email===email))return {error:'EXISTS'};
 const user={id:randomUUID(),email,passwordHash,role:'admin' as const};memoryUsers.set(user.id,user);
 const principal={id:user.id,email:user.email,role:user.role};return {principal,token:await issueSession(principal)};
}
async function isAccountLocked(digest:string):Promise<boolean>{
 if(pool){const result=await pool.query<{locked:boolean}>('SELECT COALESCE(locked_until>now(),false) AS locked FROM auth_login_attempts WHERE email_digest=$1',[digest]);return result.rows[0]?.locked??false;}
 const attempt=memoryLoginAttempts.get(digest);return !!attempt?.lockedUntil&&attempt.lockedUntil>Date.now();
}
async function recordLoginFailure(digest:string):Promise<void>{
 if(pool){await pool.query(`INSERT INTO auth_login_attempts(email_digest,failed_attempts,locked_until,updated_at) VALUES($1,1,NULL,now())
 ON CONFLICT(email_digest) DO UPDATE SET
 failed_attempts=CASE WHEN auth_login_attempts.locked_until IS NOT NULL AND auth_login_attempts.locked_until<=now() THEN 1 ELSE auth_login_attempts.failed_attempts+1 END,
 locked_until=CASE WHEN auth_login_attempts.locked_until IS NOT NULL AND auth_login_attempts.locked_until<=now() THEN NULL
 WHEN auth_login_attempts.failed_attempts+1 >= $2 THEN now()+($3::integer * interval '1 second')
 ELSE auth_login_attempts.locked_until END,updated_at=now()`,[digest,LOGIN_FAILURE_LIMIT,LOGIN_LOCKOUT_SECONDS]);return;}
 const current=memoryLoginAttempts.get(digest);
 if(current?.lockedUntil&&current.lockedUntil>Date.now())return;
 const failures=current?.lockedUntil&&current.lockedUntil<=Date.now()?1:(current?.failures??0)+1;
 memoryLoginAttempts.set(digest,{failures,lockedUntil:failures>=LOGIN_FAILURE_LIMIT?Date.now()+LOGIN_LOCKOUT_SECONDS*1000:null});
}
async function clearLoginFailures(digest:string):Promise<void>{if(pool){await pool.query('DELETE FROM auth_login_attempts WHERE email_digest=$1',[digest]);return;}memoryLoginAttempts.delete(digest);}
export async function loginUser(input:unknown):Promise<{principal:Principal,token:string}|null>{
 const parsed=loginSchema.safeParse(input);if(!parsed.success)return null;
 const {email,password}=parsed.data;const digest=digestAccount(email);
 if(await isAccountLocked(digest))return null;
 let user:{id:string,email:string,password_hash:string,role:Role}|undefined;
 if(pool){const r=await pool.query<{id:string,email:string,password_hash:string,role:Role}>('SELECT id,email,password_hash,role FROM users WHERE email=$1',[email]);user=r.rows[0];}
 else{const found=[...memoryUsers.values()].find(u=>u.email===email);if(found)user={id:found.id,email:found.email,password_hash:found.passwordHash,role:found.role};}
 if(!user||!(await verifyPassword(password,user.password_hash))){await recordLoginFailure(digest);return null;}
 await clearLoginFailures(digest);
 const principal={id:user.id,email:user.email,role:user.role};return {principal,token:await issueSession(principal)};
}
export async function requestPasswordReset(input:unknown):Promise<void>{
 const parsed=z.object({email:z.string().trim().email().max(254).transform(v=>v.toLowerCase())}).strict().safeParse(input);
 if(!parsed.success)throw new Error('INVALID_EMAIL');
 const email=parsed.data.email;
 let user:{id:string,email:string}|undefined;
 if(pool){const found=await pool.query<{id:string,email:string}>('SELECT id,email FROM users WHERE email=$1',[email]);user=found.rows[0];}
 else{const found=[...memoryUsers.values()].find(item=>item.email===email);if(found)user={id:found.id,email:found.email};}
 if(!user)return;
 const token=randomBytes(32).toString('base64url');const tokenHash=digestResetToken(token);
 const expiresAt=new Date(Date.now()+RESET_TOKEN_TTL_SECONDS*1000);
 if(pool){
  const client=await pool.connect();
  try{await client.query('BEGIN');await client.query("UPDATE auth_email_tokens SET consumed_at=now() WHERE user_id=$1 AND purpose='password_reset' AND consumed_at IS NULL",[user.id]);await client.query("INSERT INTO auth_email_tokens(token_hash,user_id,purpose,expires_at) VALUES($1,$2,'password_reset',$3)",[tokenHash,user.id,expiresAt]);await client.query('COMMIT');}
  catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
 }else{for(const item of memoryResetTokens.values())if(item.userId===user.id&&!item.consumed)item.consumed=true;memoryResetTokens.set(tokenHash,{userId:user.id,expiresAt:expiresAt.getTime(),consumed:false});}
 await sendPasswordResetEmail({to:user.email,resetUrl:passwordResetUrl(token),expiresInMinutes:RESET_TOKEN_TTL_SECONDS/60});
}
export async function completePasswordReset(input:unknown):Promise<boolean>{
 const parsed=z.object({token:z.string().min(40).max(100),password:registration.shape.password}).strict().safeParse(input);
 if(!parsed.success)return false;
 const tokenHash=digestResetToken(parsed.data.token);const passwordHash=await hashPassword(parsed.data.password);
 if(pool){
  const client=await pool.connect();
  try{
   await client.query('BEGIN');
   const token=await client.query<{user_id:string}>("SELECT user_id FROM auth_email_tokens WHERE token_hash=$1 AND purpose='password_reset' AND consumed_at IS NULL AND expires_at>now() FOR UPDATE",[tokenHash]);
   const userId=token.rows[0]?.user_id;if(!userId){await client.query('ROLLBACK');return false;}
   await client.query('UPDATE users SET password_hash=$1 WHERE id=$2',[passwordHash,userId]);
   await client.query('UPDATE auth_email_tokens SET consumed_at=now() WHERE token_hash=$1',[tokenHash]);
   await client.query('UPDATE auth_sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL',[userId]);
   const account=await client.query<{email:string}>('SELECT email FROM users WHERE id=$1',[userId]);
   if(account.rows[0])await client.query('DELETE FROM auth_login_attempts WHERE email_digest=$1',[digestAccount(account.rows[0].email)]);
   await client.query('COMMIT');return true;
  }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
 }
 const token=memoryResetTokens.get(tokenHash);if(!token||token.consumed||token.expiresAt<=Date.now())return false;
 const user=memoryUsers.get(token.userId);if(!user)return false;
 user.passwordHash=passwordHash;token.consumed=true;
 for(const session of memorySessions.values())if(session.principal.id===user.id&&session.revokedAt===null)session.revokedAt=new Date().toISOString();
 memoryLoginAttempts.delete(digestAccount(user.email));return true;
}
export async function authenticate(req:Request,res:Response,next:NextFunction):Promise<void>{const header=req.headers.authorization;const match=typeof header==='string'?/^Bearer ([A-Za-z0-9._~-]+)$/.exec(header):null;const claims=match?decodeToken(match[1]!):null;if(!claims){res.status(401).json({error:{code:'UNAUTHENTICATED',message:'A valid bearer token is required'}});return;}try{if(pool){const result=await pool.query<{id:string;email:string;role:Role}>("SELECT u.id,u.email,u.role FROM auth_sessions s JOIN users u ON u.id=s.user_id WHERE s.id=$1 AND s.user_id=$2 AND s.revoked_at IS NULL AND s.expires_at>now()",[claims.jti,claims.sub]);const user=result.rows[0];if(!user){res.status(401).json({error:{code:'UNAUTHENTICATED',message:'A valid bearer token is required'}});return;}req.principal={id:user.id,email:user.email,role:user.role};}else{const session=memorySessions.get(claims.jti);if(!session||session.principal.id!==claims.sub||session.revokedAt!==null||Date.parse(session.expiresAt)<=Date.now()){res.status(401).json({error:{code:'UNAUTHENTICATED',message:'A valid bearer token is required'}});return;}req.principal=session.principal;}req.authSessionId=claims.jti;next();}catch{res.status(503).json({error:{code:'AUTHENTICATION_STORE_UNAVAILABLE',message:'Session verification is temporarily unavailable'}});}}
export function requireOwnerOrAdmin(ownerId:string,principal:Principal):boolean{return principal.role==='admin'||ownerId===principal.id;}
export function resetMemoryUsersForTests():void{memoryUsers.clear();memorySessions.clear();memoryLoginAttempts.clear();memoryResetTokens.clear();}
