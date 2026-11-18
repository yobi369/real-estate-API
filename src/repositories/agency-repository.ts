import { randomUUID } from 'node:crypto';
import { pool } from '../db.js';

export type AgencyRole='owner'|'admin'|'agent'|'viewer';
export type AgencySummary={id:string;name:string;slug:string;status:'active'|'suspended'|'closed';role:AgencyRole;createdAt:string};

const slugBase=(name:string)=>name.normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,120)||'agency';

export class AgencyRepository {
  async getActiveMembership(userId:string,agencyId:string):Promise<{role:AgencyRole}|undefined>{
    if(!pool)throw new Error('PERSISTENCE_REQUIRED');
    const result=await pool.query<{role:AgencyRole}>(
      "SELECT m.role FROM agency_memberships m JOIN agencies a ON a.id=m.agency_id WHERE m.user_id=$1 AND m.agency_id=$2 AND m.status='active' AND a.status='active'",
      [userId,agencyId]
    );
    return result.rows[0];
  }

  async createForUser(userId:string,name:string):Promise<AgencySummary>{
    if(!pool)throw new Error('PERSISTENCE_REQUIRED');
    const client=await pool.connect();
    const id=randomUUID();
    const slug=`${slugBase(name)}-${id.slice(0,8)}`;
    try{
      await client.query('BEGIN');
      const agency=await client.query<{id:string;name:string;slug:string;status:AgencySummary['status'];created_at:Date}>(
        'INSERT INTO agencies(id,name,slug,created_by) VALUES($1,$2,$3,$4) RETURNING id,name,slug,status,created_at',
        [id,name,slug,userId]
      );
      await client.query(
        "INSERT INTO agency_memberships(id,agency_id,user_id,role,status) VALUES($1,$2,$3,'owner','active')",
        [randomUUID(),id,userId]
      );
      await client.query(
        "INSERT INTO audit_events(id,agency_id,actor_user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,$3,'agency.created','agency',$5,$4::jsonb)",
        [randomUUID(),id,userId,JSON.stringify({name}),id]
      );
      await client.query('COMMIT');
      const row=agency.rows[0]!;
      return {id:row.id,name:row.name,slug:row.slug,status:row.status,role:'owner',createdAt:row.created_at.toISOString()};
    }catch(error){
      await client.query('ROLLBACK');
      throw error;
    }finally{client.release();}
  }

  async listForUser(userId:string):Promise<AgencySummary[]>{
    if(!pool)throw new Error('PERSISTENCE_REQUIRED');
    const result=await pool.query<{id:string;name:string;slug:string;status:AgencySummary['status'];role:AgencyRole;created_at:Date}>(
      `SELECT a.id,a.name,a.slug,a.status,m.role,m.created_at
       FROM agency_memberships m JOIN agencies a ON a.id=m.agency_id
       WHERE m.user_id=$1 AND m.status='active' AND a.status='active'
       ORDER BY m.created_at ASC,a.name ASC`,
      [userId]
    );
    return result.rows.map(row=>({id:row.id,name:row.name,slug:row.slug,status:row.status,role:row.role,createdAt:row.created_at.toISOString()}));
  }
}
