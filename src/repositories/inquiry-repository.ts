import { randomUUID } from 'node:crypto';
import type { InquiryInput,StoredInquiry } from '../domain/inquiry.js';
import { pool } from '../db.js';
const memory=new Map<string,StoredInquiry>();
const fromRow=(r:Record<string,unknown>):StoredInquiry=>{
 const details=(r.details&&typeof r.details==='object'?r.details:{}) as Record<string,unknown>;
 return {...details as unknown as InquiryInput,requestType:String(r.request_type) as InquiryInput['requestType'],name:String(r.name),email:String(r.email),phone:String(r.phone),message:String(r.message),...(r.service==null?{}:{service:String(r.service)}),...(r.listing_id==null?{}:{listingId:String(r.listing_id)}),...(r.listing_title==null?{}:{listingTitle:String(r.listing_title)}),...(r.listing_category==null?{}:{listingCategory:String(r.listing_category) as InquiryInput['listingCategory']}),id:String(r.id),status:String(r.status) as StoredInquiry['status'],createdAt:new Date(String(r.created_at)).toISOString()};
};
export class InquiryRepository{
 async create(input:InquiryInput):Promise<StoredInquiry>{
  const id=randomUUID();
  if(pool){
   if(input.agencySlug){
    const agency=await pool.query('SELECT id FROM agencies WHERE slug=$1 AND status=\'active\'',[input.agencySlug]);
    if(!agency.rows[0])throw new Error('AGENCY_NOT_FOUND');
   }
   const result=await pool.query(
    'INSERT INTO inquiries(id,agency_id,listing_id,listing_title,listing_category,request_type,name,email,phone,message,service,details) VALUES($1,COALESCE((SELECT agency_id FROM properties WHERE id=$2),(SELECT id FROM agencies WHERE slug=$3 AND status=\'active\')),$2,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb) RETURNING *',
    [id,input.listingId??null,input.agencySlug??null,input.listingTitle??null,input.listingCategory??null,input.requestType,input.name,input.email,input.phone,input.message,input.service??null,JSON.stringify(input)]
   );
   return fromRow(result.rows[0]!);
  }
  const item:StoredInquiry={...input,id,status:'new',createdAt:new Date().toISOString()};
  memory.set(id,item);
  return item;
 }
 async list(limit=100,agencyId?:string):Promise<StoredInquiry[]>{if(pool){const r=await pool.query(`SELECT * FROM inquiries WHERE agency_id=$2 ORDER BY created_at DESC LIMIT $1`,[limit,agencyId]);return r.rows.map(fromRow);}return [];}
 async clear():Promise<void>{if(!pool)memory.clear();else await pool.query('DELETE FROM inquiries');}
}
