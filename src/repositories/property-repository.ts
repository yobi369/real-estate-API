import { randomUUID } from 'node:crypto';
import type { Property,PropertyInput,PropertyQuery } from '../domain/property.js';
import { pool } from '../db.js';
export type StoredProperty=Property & {ownerId:string;agencyId?:string;publicationStatus:'draft'|'published'|'archived'};
const memory=new Map<string,StoredProperty>();
const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const slugify=(s:string)=>s.toLocaleLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,150);
const fromRow=(r:Record<string,unknown>):StoredProperty=>({
 id:String(r.id),ownerId:String(r.owner_id),...(r.agency_id==null?{}:{agencyId:String(r.agency_id)}),publicationStatus:String(r.publication_status??'published') as StoredProperty['publicationStatus'],title:String(r.title),slug:String(r.slug||slugify(String(r.title))),
 description:String(r.description),category:r.category as Property['category'],price:Number(r.price),
 priceType:r.price_type as Property['priceType'],currency:r.currency as Property['currency'],
 propertyType:r.property_type as Property['propertyType'],transactionType:r.transaction_type as Property['transactionType'],
 bedrooms:Number(r.bedrooms),bathrooms:Number(r.bathrooms),city:String(r.city),location:String(r.location||r.city),
 address:String(r.address||r.city),country:String(r.country),areaSqm:Number(r.area_sqm),sizeAcres:Number(r.size_acres),
 titleStatus:r.title_status==null?undefined:String(r.title_status),landUse:r.land_use==null?undefined:String(r.land_use),
 maxGuests:Number(r.max_guests),featured:Boolean(r.featured),imageUrls:Array.isArray(r.image_urls)?r.image_urls as string[]:[],
 createdAt:new Date(String(r.created_at)).toISOString(),updatedAt:new Date(String(r.updated_at)).toISOString()
});
export class PropertyRepository{
 async list(q:PropertyQuery):Promise<{items:StoredProperty[];total:number;page:number;limit:number}>{
  if(pool){
   const clauses:string[]=[];const values:unknown[]=[];
   const add=(sql:string,v:unknown)=>{values.push(v);clauses.push(sql.replace('?',`$${values.length}`));};
   if(q.city)add('lower(city)=lower(?)',q.city);if(q.category)add('category=?',q.category);
   if(q.propertyType)add('property_type=?',q.propertyType);if(q.transactionType)add('transaction_type=?',q.transactionType);
   if(q.minPrice!==undefined)add('price>=?',q.minPrice);if(q.maxPrice!==undefined)add('price<=?',q.maxPrice);
   if(q.search){values.push(`%${q.search}%`);const p=`$${values.length}`;clauses.push(`(title ILIKE ${p} OR description ILIKE ${p} OR city ILIKE ${p} OR location ILIKE ${p})`);}
   clauses.unshift("publication_status='published'");const where=`WHERE ${clauses.join(' AND ')}`;const count=await pool.query<{count:string}>(`SELECT count(*)::text AS count FROM properties ${where}`,values);
   const rows=await pool.query(`SELECT * FROM properties ${where} ORDER BY featured DESC,created_at DESC LIMIT $${values.length+1} OFFSET $${values.length+2}`,[...values,q.limit,(q.page-1)*q.limit]);
   return {items:rows.rows.map(fromRow),total:Number(count.rows[0]?.count??0),page:q.page,limit:q.limit};
  }
  const needle=q.search?.toLocaleLowerCase();const matches=[...memory.values()].filter(p=>p.publicationStatus==='published'&&(!q.city||p.city.toLocaleLowerCase()===q.city.toLocaleLowerCase())&&(!q.category||p.category===q.category)&&(!q.propertyType||p.propertyType===q.propertyType)&&(!q.transactionType||p.transactionType===q.transactionType)&&(q.minPrice===undefined||p.price>=q.minPrice)&&(q.maxPrice===undefined||p.price<=q.maxPrice)&&(!needle||`${p.title} ${p.description} ${p.city} ${p.location}`.toLocaleLowerCase().includes(needle))).sort((a,b)=>Number(b.featured)-Number(a.featured)||b.createdAt.localeCompare(a.createdAt));
  const start=(q.page-1)*q.limit;return {items:matches.slice(start,start+q.limit),total:matches.length,page:q.page,limit:q.limit};
 }
 async listForAgency(agencyId:string,q:PropertyQuery):Promise<{items:StoredProperty[];total:number;page:number;limit:number}>{
  if(pool){
   const placeholder=(index:number)=>String.fromCharCode(36)+index;
   const clauses:string[]=['agency_id='+placeholder(1)];const values:unknown[]=[agencyId];
   const add=(sql:string,v:unknown)=>{values.push(v);clauses.push(sql.replace('?',placeholder(values.length)));};
   if(q.city)add('lower(city)=lower(?)',q.city);if(q.category)add('category=?',q.category);
   if(q.propertyType)add('property_type=?',q.propertyType);if(q.transactionType)add('transaction_type=?',q.transactionType);
   if(q.minPrice!==undefined)add('price>=?',q.minPrice);if(q.maxPrice!==undefined)add('price<=?',q.maxPrice);
   if(q.search){values.push('%'+q.search+'%');const p=placeholder(values.length);clauses.push('(title ILIKE '+p+' OR description ILIKE '+p+' OR city ILIKE '+p+' OR location ILIKE '+p+')');}
   const where='WHERE '+clauses.join(' AND ');
   const count=await pool.query<{count:string}>('SELECT count(*)::text AS count FROM properties '+where,values);
   const rows=await pool.query('SELECT * FROM properties '+where+' ORDER BY featured DESC,created_at DESC LIMIT '+placeholder(values.length+1)+' OFFSET '+placeholder(values.length+2),[...values,q.limit,(q.page-1)*q.limit]);
   return {items:rows.rows.map(fromRow),total:Number(count.rows[0]?.count??0),page:q.page,limit:q.limit};
  }
  const needle=q.search?.toLocaleLowerCase();
  const matches=[...memory.values()].filter(p=>p.agencyId===agencyId&&(!q.city||p.city.toLocaleLowerCase()===q.city.toLocaleLowerCase())&&(!q.category||p.category===q.category)&&(!q.propertyType||p.propertyType===q.propertyType)&&(!q.transactionType||p.transactionType===q.transactionType)&&(q.minPrice===undefined||p.price>=q.minPrice)&&(q.maxPrice===undefined||p.price<=q.maxPrice)&&(!needle||[p.title,p.description,p.city,p.location].join(' ').toLocaleLowerCase().includes(needle))).sort((a,b)=>Number(b.featured)-Number(a.featured)||b.createdAt.localeCompare(a.createdAt));
  const start=(q.page-1)*q.limit;return {items:matches.slice(start,start+q.limit),total:matches.length,page:q.page,limit:q.limit};
 }
 async getById(id:string,agencyId?:string):Promise<StoredProperty|undefined>{if(!UUID_RE.test(id))return undefined;if(pool){const r=await pool.query(`SELECT * FROM properties WHERE id=$1${agencyId?' AND agency_id=$2':' AND publication_status=\'published\''}` ,agencyId?[id,agencyId]:[id]);return r.rows[0]?fromRow(r.rows[0]):undefined;}const item=memory.get(id);return item&&(!agencyId?(item.publicationStatus==='published'):item.agencyId===agencyId)?item:undefined;}
 async create(input:PropertyInput,ownerId:string,agencyId?:string):Promise<StoredProperty>{
  const normalized={...input,slug:input.slug||slugify(input.title),location:input.location||input.city,address:input.address||input.location||input.city};
  if(pool){
   const client=await pool.connect();
   try{
    await client.query('BEGIN');
    if(agencyId){
     await client.query('SELECT id FROM agencies WHERE id=$1 FOR UPDATE',[agencyId]);
     const plan=await client.query<{max_listings:number|null}>(`SELECT p.max_listings FROM agency_subscriptions s JOIN subscription_plans p ON p.id=s.plan_id WHERE s.agency_id=$1 AND s.status IN ('active','trialing') AND s.current_period_end>now() ORDER BY s.created_at DESC LIMIT 1`,[agencyId]);
     if(!plan.rows[0])throw new Error('SUBSCRIPTION_REQUIRED');
     if(plan.rows[0].max_listings!==null){
      const count=await client.query<{count:string}>(`SELECT count(*)::text AS count FROM properties WHERE agency_id=$1 AND publication_status<>'archived'`,[agencyId]);
      if(Number(count.rows[0]?.count??0)>=plan.rows[0].max_listings)throw new Error('LISTING_LIMIT_REACHED');
     }
    }
    const result=await client.query(`INSERT INTO properties(id,owner_id,agency_id,publication_status,title,slug,description,category,price,price_type,currency,property_type,transaction_type,bedrooms,bathrooms,city,location,address,country,area_sqm,size_acres,title_status,land_use,max_guests,featured,image_urls) VALUES($1,$2,$3,'draft',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25) RETURNING *`,[randomUUID(),ownerId,agencyId??null,normalized.title,normalized.slug,normalized.description,normalized.category,normalized.price,normalized.priceType,normalized.currency,normalized.propertyType,normalized.transactionType,normalized.bedrooms,normalized.bathrooms,normalized.city,normalized.location,normalized.address,normalized.country,normalized.areaSqm,normalized.sizeAcres,normalized.titleStatus??null,normalized.landUse??null,normalized.maxGuests,normalized.featured,JSON.stringify(normalized.imageUrls)]);
    const property=result.rows[0]!;
    await client.query('INSERT INTO audit_events(id,agency_id,actor_user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,$3,\'property.created\',\'property\',$4,$5::jsonb)',[randomUUID(),agencyId??null,ownerId,property.id,JSON.stringify({category:normalized.category,propertyType:normalized.propertyType,transactionType:normalized.transactionType})]);
    await client.query('COMMIT');
    return fromRow(property);
   }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
  }
  const now=new Date().toISOString();const p:StoredProperty={...normalized,id:randomUUID(),ownerId,...(agencyId?{agencyId}:{}),publicationStatus:'draft',createdAt:now,updatedAt:now};memory.set(p.id,p);return p;
 }
 async update(id:string,input:PropertyInput,agencyId?:string,actorUserId?:string):Promise<StoredProperty|undefined>{
  if(!UUID_RE.test(id))return undefined;
  const normalized={...input,slug:input.slug||slugify(input.title),location:input.location||input.city,address:input.address||input.location||input.city};
  if(pool){
   const values=[id,normalized.title,normalized.slug,normalized.description,normalized.category,normalized.price,normalized.priceType,normalized.currency,normalized.propertyType,normalized.transactionType,normalized.bedrooms,normalized.bathrooms,normalized.city,normalized.location,normalized.address,normalized.country,normalized.areaSqm,normalized.sizeAcres,normalized.titleStatus??null,normalized.landUse??null,normalized.maxGuests,normalized.featured,JSON.stringify(normalized.imageUrls)];
   if(agencyId)values.push(agencyId);
   const sql=`UPDATE properties SET title=$2,slug=$3,description=$4,category=$5,price=$6,price_type=$7,currency=$8,property_type=$9,transaction_type=$10,bedrooms=$11,bathrooms=$12,city=$13,location=$14,address=$15,country=$16,area_sqm=$17,size_acres=$18,title_status=$19,land_use=$20,max_guests=$21,featured=$22,image_urls=$23,updated_at=now() WHERE id=$1${agencyId?' AND agency_id=$24':''} RETURNING *`;
   const client=await pool.connect();
   try{
    await client.query('BEGIN');
    const result=await client.query(sql,values);
    if(!result.rows[0]){await client.query('ROLLBACK');return undefined;}
    await client.query('INSERT INTO audit_events(id,agency_id,actor_user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,$3,\'property.updated\',\'property\',$4,$5::jsonb)',[randomUUID(),agencyId??null,actorUserId??null,id,JSON.stringify({category:normalized.category,propertyType:normalized.propertyType,transactionType:normalized.transactionType})]);
    await client.query('COMMIT');
    return fromRow(result.rows[0]);
   }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
  }
  const old=memory.get(id);
  if(!old||(agencyId&&old.agencyId!==agencyId))return undefined;
  const p:StoredProperty={...normalized,id,ownerId:old.ownerId,...(old.agencyId?{agencyId:old.agencyId}:{}),publicationStatus:old.publicationStatus,createdAt:old.createdAt,updatedAt:new Date().toISOString()};
  memory.set(id,p);
  return p;
 }
 async setPublicationStatus(id:string,agencyId:string,status:'draft'|'published'|'archived',actorUserId:string):Promise<StoredProperty|undefined>{
  if(!UUID_RE.test(id))return undefined;
  if(!pool)throw new Error('PERSISTENCE_REQUIRED');
  const client=await pool.connect();
  try{
   await client.query('BEGIN');
   const result=await client.query('UPDATE properties SET publication_status=$3,updated_at=now() WHERE id=$1 AND agency_id=$2 RETURNING *',[id,agencyId,status]);
   if(!result.rows[0]){await client.query('ROLLBACK');return undefined;}
   await client.query('INSERT INTO audit_events(id,agency_id,actor_user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,$3,$4,\'property\',$5,$6::jsonb)',[randomUUID(),agencyId,actorUserId,`property.publication.${status}`,id,JSON.stringify({publicationStatus:status})]);
   await client.query('COMMIT');
   return fromRow(result.rows[0]);
  }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
 }
 async delete(id:string,agencyId?:string,actorUserId?:string):Promise<boolean>{
  if(!UUID_RE.test(id))return false;
  if(pool){
   const client=await pool.connect();
   try{
    await client.query('BEGIN');
    const result=await client.query(`DELETE FROM properties WHERE id=$1${agencyId?' AND agency_id=$2':''} RETURNING id`,agencyId?[id,agencyId]:[id]);
    if(!result.rows[0]){await client.query('ROLLBACK');return false;}
    await client.query('INSERT INTO audit_events(id,agency_id,actor_user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,$3,\'property.deleted\',\'property\',$4,$5::jsonb)',[randomUUID(),agencyId??null,actorUserId??null,id,'{}']);
    await client.query('COMMIT');
    return true;
   }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
  }
  const old=memory.get(id);if(!old||(agencyId&&old.agencyId!==agencyId))return false;return memory.delete(id);
 }
 async clear():Promise<void>{if(!pool)memory.clear();else await pool.query('DELETE FROM properties');}
}
