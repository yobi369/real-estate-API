import { randomUUID } from 'node:crypto';
import { pool } from '../db.js';

export type SubscriptionPlan = {
  id:string; code:string; name:string; description:string; currency:'KES'; priceMinor:number;
  billingInterval:'month'|'year'; maxListings:number|null; maxMembers:number|null;
  monthlyApiRequests:number|null; features:unknown; 
};
export type CurrentSubscription = {
  id:string; status:'pending'|'trialing'|'active'|'past_due'|'cancelled'|'expired';
  provider:'mpesa'|'manual'; currentPeriodStart:string|null; currentPeriodEnd:string|null;
  cancelAtPeriodEnd:boolean; plan:SubscriptionPlan;
};
export type PaymentSummary = {
  id:string; provider:'mpesa'|'manual'; amountMinor:number; currency:'KES';
  status:'initiated'|'pending'|'succeeded'|'failed'|'expired';
  mpesaReceiptNumber:string|null; createdAt:string; paidAt:string|null;
};

const mapPlan=(r:Record<string,unknown>):SubscriptionPlan=>({
 id:String(r.id),code:String(r.code),name:String(r.name),description:String(r.description??''),
 currency:'KES',priceMinor:Number(r.price_minor),billingInterval:r.billing_interval as SubscriptionPlan['billingInterval'],
 maxListings:r.max_listings==null?null:Number(r.max_listings),maxMembers:r.max_members==null?null:Number(r.max_members),
 monthlyApiRequests:r.monthly_api_requests==null?null:Number(r.monthly_api_requests),features:r.features??[]
});
export class SubscriptionRepository {
 async listActivePlans():Promise<SubscriptionPlan[]>{
  if(!pool)throw new Error('PERSISTENCE_REQUIRED');
  const result=await pool.query('SELECT * FROM subscription_plans WHERE is_active=true ORDER BY price_minor ASC,code ASC');
  return result.rows.map(mapPlan);
 }
 async getCurrent(agencyId:string):Promise<CurrentSubscription|null>{
  if(!pool)throw new Error('PERSISTENCE_REQUIRED');
  await pool.query(`UPDATE agency_subscriptions SET status='expired',updated_at=now() WHERE agency_id=$1 AND status IN ('active','trialing') AND current_period_end<=now()`,[agencyId]);
  const result=await pool.query(
   `SELECT s.id,s.status,s.provider,s.current_period_start,s.current_period_end,s.cancel_at_period_end,p.*
    FROM agency_subscriptions s JOIN subscription_plans p ON p.id=s.plan_id
    WHERE s.agency_id=$1 AND s.status IN ('pending','trialing','active','past_due')
    ORDER BY s.created_at DESC LIMIT 1`,
   [agencyId]
  );
  const row=result.rows[0];if(!row)return null;
  return {
   id:String(row.id),status:row.status,provider:row.provider,
   currentPeriodStart:row.current_period_start?new Date(row.current_period_start).toISOString():null,
   currentPeriodEnd:row.current_period_end?new Date(row.current_period_end).toISOString():null,
   cancelAtPeriodEnd:Boolean(row.cancel_at_period_end),plan:mapPlan(row)
  };
 }
 async scheduleCancellation(agencyId:string,actorUserId:string):Promise<boolean>{
  if(!pool)throw new Error('PERSISTENCE_REQUIRED');
  const client=await pool.connect();
  try{
   await client.query('BEGIN');
   const current=await client.query<{id:string;current_period_end:Date}>(`SELECT id,current_period_end FROM agency_subscriptions WHERE agency_id=$1 AND status IN ('active','trialing') AND current_period_end>now() ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,[agencyId]);
   const subscription=current.rows[0];
   if(!subscription){await client.query('ROLLBACK');return false;}
   await client.query('UPDATE agency_subscriptions SET cancel_at_period_end=true,updated_at=now() WHERE id=$1',[subscription.id]);
   await client.query(
    "INSERT INTO audit_events(id,agency_id,actor_user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,$3,'agency.subscription.cancellation_scheduled','agency_subscription',$4,$5::jsonb)",
    [randomUUID(),agencyId,actorUserId,subscription.id,JSON.stringify({cancelAtPeriodEnd:true,currentPeriodEnd:subscription.current_period_end.toISOString()})]
   );
   await client.query('COMMIT');
   return true;
  }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
 }
 async listPayments(agencyId:string,limit=20):Promise<PaymentSummary[]>{
  if(!pool)throw new Error('PERSISTENCE_REQUIRED');
  const result=await pool.query(
   `SELECT id,provider,amount_minor,currency,status,mpesa_receipt_number,created_at,paid_at
    FROM subscription_payments WHERE agency_id=$1
    ORDER BY created_at DESC LIMIT $2`,
   [agencyId,Math.max(1,Math.min(100,limit))]
  );
  return result.rows.map((r:Record<string,unknown>)=>({
   id:String(r.id),provider:r.provider as PaymentSummary['provider'],amountMinor:Number(r.amount_minor),
   currency:'KES',status:r.status as PaymentSummary['status'],
   mpesaReceiptNumber:r.mpesa_receipt_number==null?null:String(r.mpesa_receipt_number),
   createdAt:new Date(String(r.created_at)).toISOString(),
   paidAt:r.paid_at?new Date(String(r.paid_at)).toISOString():null
  }));
 }
}
