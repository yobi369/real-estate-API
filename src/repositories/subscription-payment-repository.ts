import { randomUUID } from 'node:crypto';
import { pool } from '../db.js';
import type { SubscriptionPlan } from './subscription-repository.js';

export type PaymentAttempt={id:string;agencyId:string;planId:string;planCode:string;amountMinor:number;currency:'KES';status:'initiated'|'pending'|'succeeded'|'failed'|'expired';checkoutRequestId:string|null;merchantRequestId:string|null;};
export class SubscriptionPaymentRepository {
 async getActivePlan(code:string):Promise<SubscriptionPlan|null>{
  if(!pool)throw new Error('PERSISTENCE_REQUIRED');
  const r=await pool.query('SELECT * FROM subscription_plans WHERE code=$1 AND is_active=true',[code]);
  const p=r.rows[0];if(!p)return null;
  return {id:String(p.id),code:String(p.code),name:String(p.name),description:String(p.description??''),currency:'KES',priceMinor:Number(p.price_minor),billingInterval:p.billing_interval,maxListings:p.max_listings==null?null:Number(p.max_listings),maxMembers:p.max_members==null?null:Number(p.max_members),monthlyApiRequests:p.monthly_api_requests==null?null:Number(p.monthly_api_requests),features:p.features??[]};
 }
 async createAttempt(agencyId:string,plan:SubscriptionPlan,phone:string,idempotencyKey:string):Promise<{payment:PaymentAttempt;created:boolean}>{
  if(!pool)throw new Error('PERSISTENCE_REQUIRED');
  const client=await pool.connect();
  try{
   await client.query('BEGIN');
   const existing=await client.query('SELECT p.*,s.code AS plan_code FROM subscription_payments p JOIN subscription_plans s ON s.id=p.plan_id WHERE p.agency_id=$1 AND p.idempotency_key=$2 FOR UPDATE',[agencyId,idempotencyKey]);
   if(existing.rows[0]){
    const row=existing.rows[0];
    if(String(row.plan_id)!==plan.id||String(row.phone_number)!==phone||Number(row.amount_minor)!==plan.priceMinor)throw new Error('IDEMPOTENCY_KEY_REUSED');
    await client.query('COMMIT');return {payment:this.mapPayment(row),created:false};
   }
   const active=await client.query("SELECT id FROM agency_subscriptions WHERE agency_id=$1 AND status IN ('active','trialing') AND current_period_end>now() LIMIT 1 FOR UPDATE",[agencyId]);
   if(active.rows[0])throw new Error('ACTIVE_SUBSCRIPTION');
   const id=randomUUID();
   await client.query('INSERT INTO subscription_payments(id,agency_id,plan_id,provider,idempotency_key,phone_number,amount_minor,currency,status) VALUES($1,$2,$3,\'mpesa\',$4,$5,$6,\'KES\',\'initiated\') RETURNING *',[id,agencyId,plan.id,idempotencyKey,phone,plan.priceMinor]);
   await client.query('COMMIT');
   return {payment:{id,agencyId,planId:plan.id,planCode:plan.code,amountMinor:plan.priceMinor,currency:'KES',status:'initiated',checkoutRequestId:null,merchantRequestId:null},created:true};
  }catch(error){
   await client.query('ROLLBACK');
   if(typeof error==='object'&&error!==null&&'code'in error&&(error as {code?:unknown}).code==='23505'){
    const constraint='constraint'in error?String((error as {constraint?:unknown}).constraint??''):'';
    if(constraint==='subscription_payments_agency_id_idempotency_key_key'){
     const existing=await pool.query('SELECT p.*,s.code AS plan_code FROM subscription_payments p JOIN subscription_plans s ON s.id=p.plan_id WHERE p.agency_id=$1 AND p.idempotency_key=$2',[agencyId,idempotencyKey]);
     if(existing.rows[0]){
      const row=existing.rows[0];
      if(String(row.plan_id)!==plan.id||String(row.phone_number)!==phone||Number(row.amount_minor)!==plan.priceMinor)throw new Error('IDEMPOTENCY_KEY_REUSED');
      return {payment:this.mapPayment(row),created:false};
     }
    }
    throw new Error('PAYMENT_ALREADY_PENDING');
   }
   throw error;
  }
  finally{client.release();}
 }
 async attachCheckout(paymentId:string,merchantRequestId:string,checkoutRequestId:string):Promise<PaymentAttempt>{
  if(!pool)throw new Error('PERSISTENCE_REQUIRED');
  const r=await pool.query('UPDATE subscription_payments SET status=\'pending\',merchant_request_id=$2,checkout_request_id=$3,updated_at=now() WHERE id=$1 AND status=\'initiated\' RETURNING *',[paymentId,merchantRequestId,checkoutRequestId]);
  if(!r.rows[0])throw new Error('PAYMENT_STATE_CONFLICT');
  return this.mapPayment(r.rows[0]);
 }
 async markFailed(paymentId:string,code:string,description:string):Promise<void>{
  if(!pool)throw new Error('PERSISTENCE_REQUIRED');
  await pool.query('UPDATE subscription_payments SET status=\'failed\',result_code=$2,result_description=$3,updated_at=now() WHERE id=$1 AND status IN (\'initiated\',\'pending\')',[paymentId,code.slice(0,80),description.slice(0,500)]);
 }
 async getForReconciliation(agencyId:string,paymentId:string):Promise<PaymentAttempt|null>{
  if(!pool)throw new Error('PERSISTENCE_REQUIRED');
  const r=await pool.query('SELECT p.*,s.code AS plan_code FROM subscription_payments p JOIN subscription_plans s ON s.id=p.plan_id WHERE p.agency_id=$1 AND p.id=$2',[agencyId,paymentId]);
  return r.rows[0]?this.mapPayment(r.rows[0]):null;
 }
 async processQuery(input:{agencyId:string;paymentId:string;resultCode:number|null;resultDescription:string;payload:unknown}):Promise<{found:boolean;status:string;duplicate:boolean}>{
  if(!pool)throw new Error('PERSISTENCE_REQUIRED');
  const client=await pool.connect();
  try{
   await client.query('BEGIN');
   const found=await client.query('SELECT p.*,s.billing_interval FROM subscription_payments p JOIN subscription_plans s ON s.id=p.plan_id WHERE p.agency_id=$1 AND p.id=$2 FOR UPDATE',[input.agencyId,input.paymentId]);
   const payment=found.rows[0];
   if(!payment){await client.query('ROLLBACK');return {found:false,status:'not_found',duplicate:false};}
   if(payment.status==='succeeded'||payment.status==='failed'||payment.status==='expired'){await client.query('COMMIT');return {found:true,status:payment.status,duplicate:true};}
   if(input.resultCode===null){await client.query('COMMIT');return {found:true,status:'pending',duplicate:false};}
   if(input.resultCode!==0){
    await client.query('UPDATE subscription_payments SET status=\'failed\',result_code=$3,result_description=$4,callback_payload=$5::jsonb,updated_at=now() WHERE id=$1 AND agency_id=$2',[payment.id,input.agencyId,String(input.resultCode),input.resultDescription,JSON.stringify(input.payload)]);
    await client.query('COMMIT');return {found:true,status:'failed',duplicate:false};
   }
   const current=await client.query("SELECT * FROM agency_subscriptions WHERE agency_id=$1 AND status IN ('active','trialing','past_due') ORDER BY created_at DESC LIMIT 1 FOR UPDATE",[payment.agency_id]);
   let subscriptionId:string;
   if(current.rows[0]){
    const updated=await client.query("UPDATE agency_subscriptions SET plan_id=$2,status='active',provider='mpesa',current_period_start=GREATEST(COALESCE(current_period_end,now()),now()),current_period_end=GREATEST(COALESCE(current_period_end,now()),now())+CASE WHEN $3='year' THEN interval '1 year' ELSE interval '1 month' END,cancel_at_period_end=false,cancelled_at=NULL,updated_at=now() WHERE id=$1 RETURNING id",[current.rows[0].id,payment.plan_id,payment.billing_interval]);
    subscriptionId=String(updated.rows[0].id);
   }else{
    const inserted=await client.query("INSERT INTO agency_subscriptions(id,agency_id,plan_id,status,provider,current_period_start,current_period_end) VALUES($1,$2,$3,'active','mpesa',now(),now()+CASE WHEN $4='year' THEN interval '1 year' ELSE interval '1 month' END) RETURNING id",[randomUUID(),payment.agency_id,payment.plan_id,payment.billing_interval]);
    subscriptionId=String(inserted.rows[0].id);
   }
   await client.query("UPDATE subscription_payments SET status='succeeded',result_code='0',result_description=$2,callback_payload=$3::jsonb,paid_at=now(),subscription_id=$4,updated_at=now() WHERE id=$1",[payment.id,input.resultDescription,JSON.stringify(input.payload),subscriptionId]);
   await client.query('COMMIT');return {found:true,status:'succeeded',duplicate:false};
  }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
 }
 async processCallback(input:{checkoutRequestId:string;resultCode:number;resultDescription:string;amount:number|null;receipt:string|null;payload:unknown}):Promise<{found:boolean;status:string;duplicate:boolean}>{
  if(!pool)throw new Error('PERSISTENCE_REQUIRED');
  const client=await pool.connect();
  try{
   await client.query('BEGIN');
   const found=await client.query('SELECT p.*,s.billing_interval,s.code AS plan_code FROM subscription_payments p JOIN subscription_plans s ON s.id=p.plan_id WHERE p.checkout_request_id=$1 FOR UPDATE',[input.checkoutRequestId]);
   const payment=found.rows[0];
   if(!payment){await client.query('ROLLBACK');return {found:false,status:'not_found',duplicate:false};}
   if(payment.status==='succeeded'){
    const validDuplicate=input.amount!==null&&input.amount*100===Number(payment.amount_minor);
    if(input.resultCode===0&&!payment.mpesa_receipt_number&&input.receipt&&validDuplicate)await client.query('UPDATE subscription_payments SET mpesa_receipt_number=$2,callback_payload=$3::jsonb,updated_at=now() WHERE id=$1',[payment.id,input.receipt,JSON.stringify(input.payload)]);
    await client.query('COMMIT');return {found:true,status:'succeeded',duplicate:true};
   }
   if(payment.status==='failed'||payment.status==='expired'){await client.query('COMMIT');return {found:true,status:payment.status,duplicate:true};}
   const validAmount=input.amount!==null&&input.amount*100===Number(payment.amount_minor);
   if(input.resultCode!==0){
    await client.query('UPDATE subscription_payments SET status=\'failed\',result_code=$2,result_description=$3,callback_payload=$4::jsonb,updated_at=now() WHERE id=$1',[payment.id,String(input.resultCode),input.resultDescription,JSON.stringify(input.payload)]);
    await client.query('COMMIT');return {found:true,status:'failed',duplicate:false};
   }
   if(!validAmount||!input.receipt){
    const reason='Successful callback did not include the expected amount and receipt; payment requires provider reconciliation';
    await client.query('UPDATE subscription_payments SET status=\'pending\',result_code=\'CALLBACK_VALIDATION_PENDING\',result_description=$2,callback_payload=$3::jsonb,updated_at=now() WHERE id=$1',[payment.id,reason,JSON.stringify(input.payload)]);
    await client.query('COMMIT');return {found:true,status:'pending',duplicate:false};
   }
   const current=await client.query("SELECT * FROM agency_subscriptions WHERE agency_id=$1 AND status IN ('active','trialing','past_due') ORDER BY created_at DESC LIMIT 1 FOR UPDATE",[payment.agency_id]);
   let subscriptionId:string;
   if(current.rows[0]){
    const updated=await client.query("UPDATE agency_subscriptions SET plan_id=$2,status='active',provider='mpesa',current_period_start=GREATEST(COALESCE(current_period_end,now()),now()),current_period_end=GREATEST(COALESCE(current_period_end,now()),now())+CASE WHEN $3='year' THEN interval '1 year' ELSE interval '1 month' END,cancel_at_period_end=false,cancelled_at=NULL,updated_at=now() WHERE id=$1 RETURNING id",[current.rows[0].id,payment.plan_id,payment.billing_interval]);
    subscriptionId=String(updated.rows[0].id);
   }else{
    const inserted=await client.query("INSERT INTO agency_subscriptions(id,agency_id,plan_id,status,provider,current_period_start,current_period_end) VALUES($1,$2,$3,'active','mpesa',now(),now()+CASE WHEN $4='year' THEN interval '1 year' ELSE interval '1 month' END) RETURNING id",[randomUUID(),payment.agency_id,payment.plan_id,payment.billing_interval]);
    subscriptionId=String(inserted.rows[0].id);
   }
   await client.query("UPDATE subscription_payments SET status='succeeded',result_code='0',result_description=$2,mpesa_receipt_number=$3,callback_payload=$4::jsonb,paid_at=now(),subscription_id=$5,updated_at=now() WHERE id=$1",[payment.id,input.resultDescription,input.receipt,JSON.stringify(input.payload),subscriptionId]);
   await client.query('COMMIT');return {found:true,status:'succeeded',duplicate:false};
  }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
 }
 private mapPayment(row:Record<string,unknown>):PaymentAttempt{return {id:String(row.id),agencyId:String(row.agency_id),planId:String(row.plan_id),planCode:String(row.plan_code??''),amountMinor:Number(row.amount_minor),currency:'KES',status:row.status as PaymentAttempt['status'],checkoutRequestId:row.checkout_request_id==null?null:String(row.checkout_request_id),merchantRequestId:row.merchant_request_id==null?null:String(row.merchant_request_id)};}
}
