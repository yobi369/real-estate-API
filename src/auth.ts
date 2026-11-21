import { createHash,createHmac,randomBytes,randomUUID,scrypt as scryptCallback,timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import type { Request,Response,NextFunction } from 'express';
import { z } from 'zod';
import { config } from './config.js';
import { pool } from './db.js';
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
const memoryLoginAttempts=new Map<string,{failed:number;lockedUntil:number}>();
async function hashPassword(password:string):Promise<string>{const salt=randomUUID().replaceAll('-','');const key=await scrypt(password,salt,64) as Buffer;return salt+':'+key.toString('hex');}
async function verifyPassword(password:string,stored:string):Promise<boolean>{const [salt,hex]=stored.split(':');if(!salt||!hex||!/^[a-f0-9]{128}$/i.test(hex))return false;const expected=Buffer.from(hex,'hex');const actual=await scrypt(password,salt,expected.length) as Buffer;return actual.length===expected.length&&timingSafeEqual(actual,expected);}
function signToken(principal:Principal,sessionId:string,expiresAt:number):string{const b64=(v:unknown)=>Buffer.from(JSON.stringify(v)).toString('base64url');const now=Math.floor(Date.now()/1000);const header=b64({alg:'HS256',typ:'JWT'});const payload=b64({sub:principal.id,email:principal.email,role:principal.role,iat:now,exp:expiresAt,jti:sessionId});const body=header+'.'+payload;return body+'.'+createHmac('sha256',config.JWT_SECRET).update(body).digest('base64url');}
function decodeToken(token:string):TokenClaims|null{try{const parts=token.split('.');if(parts.length!==3)return null;const [h,p,s]=parts as [string,string,string];const expected=createHmac('sha256',config.JWT_SECRET).update(h+'.'+p).digest();const received=Buffer.from(s,'base64url');if(received.length!==expected.length||!timingSafeEqual(received,expected))return null;const header=JSON.parse(Buffer.from(h,'base64url').toString()) as {alg?:string;typ?:string};const payload=JSON.parse(Buffer.from(p,'base64url').toString()) as Partial<TokenClaims>;if(header.alg!=='HS256'||header.typ!=='JWT'||typeof payload.sub!=='string'||typeof payload.email!=='string'||!['user','admin'].includes(payload.role??'')||!Number.isSafeInteger(payload.exp)||!Number.isSafeInteger(payload.iat)||typeof payload.jti!=='string'||!/^[0-9a-f-]{36}$/i.test(payload.jti)||payload.exp!<=Math.floor(Date.now()/1000)||payload.iat!>Math.floor(Date.now()/1000)+60)return null;return payload as TokenClaims;}catch{return null;}}
async function issueSession(principal:Principal):Promise<string>{const sessionId=randomUUID();const now=Math.floor(Date.now()/1000);const expiresAt=now+config.JWT_TTL_SECONDS;const createdAt=new Date(now*1000).toISOString();const expiresAtIso=new Date(expiresAt*1000).toISOString();if(pool){await pool.query('INSERT INTO auth_sessions(id,user_id,expires_at) VALUES($1,$2,to_timestamp($3))',[sessionId,principal.id,expiresAt]);}else{memorySessions.set(sessionId,{principal,createdAt,expiresAt:expiresAtIso,revokedAt:null});}return signToken(principal,sessionId,expiresAt);}
export async function listAuthSessions(userId:string,currentSessionId:string):Promise<Array<{id:string;createdAt:string;expiresAt:string;current:boolean}>>{if(pool){const result=await pool.query<{id:string;created_at:Date;expires_at:Date}>('SELECT id,created_at,expires_at FROM auth_sessions WHERE user_id=$1 AND revoked_at IS NULL AND expires_at>now() ORDER BY created_at DESC',[userId]);return result.rows.map(row=>({id:row.id,createdAt:row.created_at.toISOString(),expiresAt:row.expires_at.toISOString(),current:row.id===currentSessionId}));}return [...memorySessions.entries()].filter(([,session])=>session.principal.id===userId&&session.revokedAt===null&&Date.parse(session.expiresAt)>Date.now()).map(([id,session])=>({id,createdAt:session.createdAt,expiresAt:session.expiresAt,current:id===currentSessionId})).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));}
export async function revokeAuthSession(userId:string,sessionId:string):Promise<boolean>{if(pool){const result=await pool.query('UPDATE auth_sessions SET revoked_at=now() WHERE id=$1 AND user_id=$2 AND revoked_at IS NULL',[sessionId,userId]);return (result.rowCount??0)>0;}const session=memorySessions.get(sessionId);if(!session||session.principal.id!==userId||session.revokedAt!==null)return false;session.revokedAt=new Date().toISOString();return true;}
export async function registerUser(input:unknown,requireVerification=false):Promise<{principal:Principal,token:string}|{principal:Principal,verificationToken:string}|{error:'INVALID'|'EXISTS'}>{
 const parsed=registration.safeParse(input);if(!parsed.success)return {error:'INVALID'};
 const {email,password}=parsed.data;const passwordHash=await hashPassword(password);
 if(pool){
  try{
   const id=randomUUID();
   const r=await pool.query<{id:string,email:string,role:Role}>(
    'INSERT INTO users(id,email,password_hash,role,email_verified_at) VALUES($1,$2,$3,$4,$5) RETURNING id,email,role',
    [id,email,passwordHash,'user',requireVerification?null:new Date()]
   );
   const principal=r.rows[0]!;
   if(requireVerification)return {principal,verificationToken:await createEmailVerificationToken(id)};
   return {principal,token:await issueSession(principal)};
  }catch(e){if((e as {code?:string}).code==='23505')return {error:'EXISTS'};throw e;}
 }
 if([...memoryUsers.values()].some(u=>u.email===email))return {error:'EXISTS'};
 const user={id:randomUUID(),email,passwordHash,role:'user' as const};memoryUsers.set(user.id,user);
 const principal={id:user.id,email:user.email,role:user.role};
 if(requireVerification)return {principal,verificationToken:randomBytes(32).toString('base64url')};
 return {principal,token:await issueSession(principal)};
}
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
   const created=await client.query<{id:string,email:string,role:Role}>('INSERT INTO users(id,email,password_hash,role,email_verified_at) VALUES($1,$2,$3,$4,now()) RETURNING id,email,role',[id,email,passwordHash,'admin']);
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
export async function loginUser(input:unknown):Promise<{principal:Principal,token:string}|{error:'LOCKED'|'UNVERIFIED'}|null>{
 const parsed=loginSchema.safeParse(input);if(!parsed.success)return null;
 const {email,password}=parsed.data;
 const emailDigest=createHmac('sha256',config.JWT_SECRET).update(email).digest('hex');
 if(pool){
  const client=await pool.connect();
  try{
   await client.query('BEGIN');
   await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[emailDigest]);
   const attempts=await client.query<{locked_until:Date|null}>('SELECT locked_until FROM auth_login_attempts WHERE email_digest=$1',[emailDigest]);
   if(attempts.rows[0]?.locked_until&&attempts.rows[0].locked_until.getTime()>Date.now()){
    await client.query('COMMIT');return {error:'LOCKED'};
   }
   const result=await client.query<{id:string,email:string,password_hash:string,role:Role,email_verified_at:Date|null}>(
    'SELECT id,email,password_hash,role,email_verified_at FROM users WHERE email=$1',[email]
   );
   const user=result.rows[0];
   const passwordValid=user?await verifyPassword(password,user.password_hash):(await scrypt(password,'secure-properties-auth-dummy-salt',64),false);
   if(!user||!passwordValid){
    const failed=await client.query<{locked_until:Date|null}>(`INSERT INTO auth_login_attempts(email_digest,failed_attempts,locked_until,updated_at)
     VALUES($1,1,NULL,now())
     ON CONFLICT(email_digest) DO UPDATE SET
      failed_attempts=CASE WHEN auth_login_attempts.updated_at<now()-interval '15 minutes' THEN 1 ELSE auth_login_attempts.failed_attempts+1 END,
      locked_until=CASE WHEN (CASE WHEN auth_login_attempts.updated_at<now()-interval '15 minutes' THEN 1 ELSE auth_login_attempts.failed_attempts+1 END)>=5 THEN now()+interval '15 minutes' ELSE NULL END,
      updated_at=now()
     RETURNING locked_until`,[emailDigest]);
    await client.query('COMMIT');
    if(failed.rows[0]?.locked_until&&failed.rows[0].locked_until.getTime()>Date.now())return {error:'LOCKED'};
    return null;
   }
   await client.query('DELETE FROM auth_login_attempts WHERE email_digest=$1',[emailDigest]);
   if(!user.email_verified_at){await client.query('COMMIT');return {error:'UNVERIFIED'};}
   await client.query('COMMIT');
   const principal={id:user.id,email:user.email,role:user.role};
   return {principal,token:await issueSession(principal)};
  }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
 }
 const found=[...memoryUsers.values()].find(u=>u.email===email);
 const attempt=memoryLoginAttempts.get(emailDigest);
 if(attempt&&attempt.lockedUntil>Date.now())return {error:'LOCKED'};
 if(!found||!(await verifyPassword(password,found.passwordHash))){
  const failed=attempt&&Date.now()-attempt.lockedUntil<15*60*1000?attempt.failed+1:1;
  memoryLoginAttempts.set(emailDigest,{failed,lockedUntil:failed>=5?Date.now()+15*60*1000:0});
  return failed>=5?{error:'LOCKED'}:null;
 }
 memoryLoginAttempts.delete(emailDigest);
 const principal={id:found.id,email:found.email,role:found.role};
 return {principal,token:await issueSession(principal)};
}
export async function authenticate(req:Request,res:Response,next:NextFunction):Promise<void>{const header=req.headers.authorization;const match=typeof header==='string'?/^Bearer ([A-Za-z0-9._~-]+)$/.exec(header):null;const claims=match?decodeToken(match[1]!):null;if(!claims){res.status(401).json({error:{code:'UNAUTHENTICATED',message:'A valid bearer token is required'}});return;}try{if(pool){const result=await pool.query<{id:string;email:string;role:Role}>("SELECT u.id,u.email,u.role FROM auth_sessions s JOIN users u ON u.id=s.user_id WHERE s.id=$1 AND s.user_id=$2 AND s.revoked_at IS NULL AND s.expires_at>now()",[claims.jti,claims.sub]);const user=result.rows[0];if(!user){res.status(401).json({error:{code:'UNAUTHENTICATED',message:'A valid bearer token is required'}});return;}req.principal={id:user.id,email:user.email,role:user.role};}else{const session=memorySessions.get(claims.jti);if(!session||session.principal.id!==claims.sub||session.revokedAt!==null||Date.parse(session.expiresAt)<=Date.now()){res.status(401).json({error:{code:'UNAUTHENTICATED',message:'A valid bearer token is required'}});return;}req.principal=session.principal;}req.authSessionId=claims.jti;next();}catch{res.status(503).json({error:{code:'AUTHENTICATION_STORE_UNAVAILABLE',message:'Session verification is temporarily unavailable'}});}}
export function requireOwnerOrAdmin(ownerId:string,principal:Principal):boolean{return principal.role==='admin'||ownerId===principal.id;}
export function resetMemoryUsersForTests():void{memoryUsers.clear();memorySessions.clear();memoryLoginAttempts.clear();}


const passwordResetPassword=z.string().min(12).max(128).regex(/[a-z]/).regex(/[A-Z]/).regex(/[0-9]/);
type EmailTokenPurpose='password_reset'|'email_verification';
async function createEmailActionToken(userId:string,purpose:EmailTokenPurpose):Promise<string>{
 if(!pool)throw new Error('PERSISTENCE_REQUIRED');
 const token=randomBytes(32).toString('base64url');
 const tokenHash=createHash('sha256').update(token).digest('hex');
 const ttl=purpose==='password_reset'?'30 minutes':'24 hours';
 const client=await pool.connect();
 try{
  await client.query('BEGIN');
  await client.query('DELETE FROM auth_email_tokens WHERE user_id=$1 AND purpose=$2',[userId,purpose]);
  await client.query('INSERT INTO auth_email_tokens(token_hash,user_id,purpose,expires_at) VALUES($1,$2,$3,now()+$4::interval)',[tokenHash,userId,purpose,ttl]);
  await client.query('COMMIT');return token;
 }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}
export async function createEmailVerificationToken(userId:string):Promise<string>{
 return createEmailActionToken(userId,'email_verification');
}
export async function createPasswordResetToken(emailInput:string):Promise<string|null>{
 if(!pool)return null;
 const email=emailInput.trim().toLowerCase();
 const user=await pool.query<{id:string}>('SELECT id FROM users WHERE email=$1',[email]);
 if(!user.rows[0])return null;
 return createEmailActionToken(user.rows[0].id,'password_reset');
}
export async function completeEmailVerification(tokenInput:string):Promise<boolean>{
 if(!pool||tokenInput.length<32||tokenInput.length>128)return false;
 const tokenHash=createHash('sha256').update(tokenInput).digest('hex');
 const client=await pool.connect();
 try{
  await client.query('BEGIN');
  const found=await client.query<{user_id:string}>(
   "SELECT user_id FROM auth_email_tokens WHERE token_hash=$1 AND purpose='email_verification' AND consumed_at IS NULL AND expires_at>now() FOR UPDATE",[tokenHash]
  );
  const record=found.rows[0];if(!record){await client.query('ROLLBACK');return false;}
  await client.query('UPDATE users SET email_verified_at=COALESCE(email_verified_at,now()) WHERE id=$1',[record.user_id]);
  await client.query('UPDATE auth_email_tokens SET consumed_at=now() WHERE token_hash=$1',[tokenHash]);
  await client.query("DELETE FROM auth_email_tokens WHERE user_id=$1 AND purpose='email_verification' AND token_hash<>$2",[record.user_id,tokenHash]);
  await client.query('COMMIT');return true;
 }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}
export async function completePasswordReset(tokenInput:string,passwordInput:string):Promise<boolean>{
 if(!pool||tokenInput.length<32||tokenInput.length>128)return false;
 const password=passwordResetPassword.safeParse(passwordInput);if(!password.success)return false;
 const tokenHash=createHash('sha256').update(tokenInput).digest('hex');
 const passwordHash=await hashPassword(password.data);
 const client=await pool.connect();
 try{
  await client.query('BEGIN');
  const found=await client.query<{user_id:string}>(
   "SELECT user_id FROM auth_email_tokens WHERE token_hash=$1 AND purpose='password_reset' AND consumed_at IS NULL AND expires_at>now() FOR UPDATE",[tokenHash]
  );
  const reset=found.rows[0];if(!reset){await client.query('ROLLBACK');return false;}
  await client.query('UPDATE users SET password_hash=$1,email_verified_at=COALESCE(email_verified_at,now()) WHERE id=$2',[passwordHash,reset.user_id]);
  await client.query('UPDATE auth_email_tokens SET consumed_at=now() WHERE token_hash=$1',[tokenHash]);
  await client.query('UPDATE auth_sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL',[reset.user_id]);
  await client.query("DELETE FROM auth_email_tokens WHERE user_id=$1 AND purpose='password_reset' AND token_hash<>$2",[reset.user_id,tokenHash]);
  await client.query('COMMIT');return true;
 }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}
