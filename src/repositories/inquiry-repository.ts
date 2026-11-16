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
  const id=randomUUID();if(pool){const r=await pool.query('INSERT INTO inquiries(id,listing_id,listing_title,listing_category,request_type,name,email,phone,message,service,details) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *',[id,input.listingId??null,input.listingTitle??null,input.listingCategory??null,input.requestType,input.name,input.email,input.phone,input.message,input.service??null,JSON.stringify(input)]);return fromRow(r.rows[0]!);}
  const item:StoredInquiry={...input,id,status:'new',createdAt:new Date().toISOString()};memory.set(id,item);return item;
 }
 async list(limit=100):Promise<StoredInquiry[]>{if(pool){const r=await pool.query('SELECT * FROM inquiries ORDER BY created_at DESC LIMIT $1',[limit]);return r.rows.map(fromRow);}return [...memory.values()].sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,limit);}
 async clear():Promise<void>{if(!pool)memory.clear();else await pool.query('DELETE FROM inquiries');}
}
