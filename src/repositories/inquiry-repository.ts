import { randomUUID } from 'node:crypto';
import type { InquiryInput,StoredInquiry } from '../domain/inquiry.js';
import { pool } from '../db.js';
const memory=new Map<string,StoredInquiry>();
const fromRow=(r:Record<string,unknown>):StoredInquiry=>{
 const details=(r.details&&typeof r.details==='object'?r.details:{}) as Record<string,unknown>;
 return {...details as unknown as InquiryInput,requestType:String(r.request_type) as InquiryInput['requestType'],name:String(r.name),email:String(r.email),phone:String(r.phone),message:String(r.message),...(r.service==null?{}:{service:String(r.service)}),...(r.listing_id==null?{}:{listingId:String(r.listing_id)}),...(r.listing_title==null?{}:{listingTitle:String(r.listing_title)}),...(r.listing_category==null?{}:{listingCategory:String(r.listing_category) as InquiryInput['listingCategory']}),id:String(r.id),...(r.agency_id==null?{}:{agencyId:String(r.agency_id)}),status:String(r.status) as StoredInquiry['status'],createdAt:new Date(String(r.created_at)).toISOString()};
};
export class InquiryRepository{
 async create(input:InquiryInput):Promise<StoredInquiry>{
  const id=randomUUID();
  if(pool){
   let agencyId:string|null=null;
   if(input.listingId){
    const listing=await pool.query<{agency_id:string|null}>("SELECT agency_id FROM properties WHERE id=$1 AND publication_status='published'",[input.listingId]);
    if(!listing.rows[0])throw new Error('LISTING_NOT_FOUND');
    agencyId=listing.rows[0].agency_id;
   }else if(input.agencySlug){
    const agency=await pool.query<{id:string}>("SELECT id FROM agencies WHERE slug=$1 AND status='active'",[input.agencySlug]);
    if(!agency.rows[0])throw new Error('AGENCY_NOT_FOUND');
    agencyId=agency.rows[0].id;
   }
   const result=await pool.query(
    'INSERT INTO inquiries(id,agency_id,listing_id,listing_title,listing_category,request_type,name,email,phone,message,service,details) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb) RETURNING *',
    [id,agencyId,input.listingId??null,input.listingTitle??null,input.listingCategory??null,input.requestType,input.name,input.email,input.phone,input.message,input.service??null,JSON.stringify(input)]
   );
   return fromRow(result.rows[0]!);
  }
  const item:StoredInquiry={...input,id,status:'new',createdAt:new Date().toISOString()};
  memory.set(id,item);
  return item;
 }
 async list(limit=100,agencyId?:string):Promise<StoredInquiry[]>{if(pool){const r=agencyId===undefined?await pool.query('SELECT * FROM inquiries ORDER BY created_at DESC LIMIT $1',[limit]):await pool.query('SELECT * FROM inquiries WHERE agency_id=$2 ORDER BY created_at DESC LIMIT $1',[limit,agencyId]);return r.rows.map(fromRow);}return [...memory.values()].filter(item=>agencyId===undefined||item.agencyId===agencyId).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,limit);}
 async clear():Promise<void>{if(!pool)memory.clear();else await pool.query('DELETE FROM inquiries');}
}
