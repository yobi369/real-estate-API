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

  async listMembers(agencyId:string):Promise<Array<{userId:string;email:string;role:AgencyRole;status:'active'|'invited'|'suspended';createdAt:string}>>{
    if(!pool)throw new Error('PERSISTENCE_REQUIRED');
    const result=await pool.query<{user_id:string;email:string;role:AgencyRole;status:'active'|'invited'|'suspended';created_at:Date}>(
      `SELECT m.user_id,u.email,m.role,m.status,m.created_at
       FROM agency_memberships m JOIN users u ON u.id=m.user_id
       WHERE m.agency_id=$1
       ORDER BY CASE m.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 WHEN 'agent' THEN 2 ELSE 3 END,m.created_at ASC,u.email ASC`,
      [agencyId]
    );
    return result.rows.map(row=>({userId:row.user_id,email:row.email,role:row.role,status:row.status,createdAt:row.created_at.toISOString()}));
  }

  async updateMemberRole(agencyId:string,userId:string,role:Exclude<AgencyRole,'owner'>,actorId:string):Promise<{userId:string;role:AgencyRole}|null>{
    if(!pool)throw new Error('PERSISTENCE_REQUIRED');
    const client=await pool.connect();
    try{
      await client.query('BEGIN');
      await client.query('SELECT id FROM agencies WHERE id=$1 FOR UPDATE',[agencyId]);
      const actor=await client.query<{role:AgencyRole}>(
        "SELECT role FROM agency_memberships WHERE agency_id=$1 AND user_id=$2 AND status='active' FOR UPDATE",[agencyId,actorId]
      );
      const actorRole=actor.rows[0]?.role;
      if(actorRole!=='owner'&&actorRole!=='admin')throw new Error('ACTOR_NOT_AUTHORIZED');
      const target=await client.query<{role:AgencyRole;status:string}>(
        'SELECT role,status FROM agency_memberships WHERE agency_id=$1 AND user_id=$2 FOR UPDATE',[agencyId,userId]
      );
      const current=target.rows[0];
      if(!current||current.status!=='active'){await client.query('ROLLBACK');return null;}
      if(current.role==='owner')throw new Error('OWNER_ROLE_IMMUTABLE');
      if(actorRole==='admin'&&(current.role==='admin'||role==='admin'))throw new Error('ROLE_CHANGE_FORBIDDEN');
      const changed=await client.query<{user_id:string;role:AgencyRole}>(
        "UPDATE agency_memberships SET role=$1,updated_at=now() WHERE agency_id=$2 AND user_id=$3 AND status='active' RETURNING user_id,role",
        [role,agencyId,userId]
      );
      await client.query(
        "INSERT INTO audit_events(id,agency_id,actor_user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,$3,'agency.member.role_updated','agency_membership',$4,$5::jsonb)",
        [randomUUID(),agencyId,actorId,userId,JSON.stringify({previousRole:current.role,newRole:role})]
      );
      await client.query('COMMIT');
      return {userId:changed.rows[0]!.user_id,role:changed.rows[0]!.role};
    }catch(error){await client.query('ROLLBACK');throw error;}
    finally{client.release();}
  }

  async removeMember(agencyId:string,userId:string,actorId:string):Promise<boolean>{
    if(!pool)throw new Error('PERSISTENCE_REQUIRED');
    const client=await pool.connect();
    try{
      await client.query('BEGIN');
      await client.query('SELECT id FROM agencies WHERE id=$1 FOR UPDATE',[agencyId]);
      const actor=await client.query<{role:AgencyRole}>(
        "SELECT role FROM agency_memberships WHERE agency_id=$1 AND user_id=$2 AND status='active' FOR UPDATE",[agencyId,actorId]
      );
      const actorRole=actor.rows[0]?.role;
      if(actorRole!=='owner'&&actorRole!=='admin')throw new Error('ACTOR_NOT_AUTHORIZED');
      const target=await client.query<{role:AgencyRole;status:string}>(
        'SELECT role,status FROM agency_memberships WHERE agency_id=$1 AND user_id=$2 FOR UPDATE',[agencyId,userId]
      );
      const current=target.rows[0];
      if(!current||current.status!=='active'){await client.query('ROLLBACK');return false;}
      if(current.role==='owner')throw new Error('LAST_OWNER_PROTECTED');
      if(actorRole==='admin'&&current.role==='admin')throw new Error('MEMBER_REMOVAL_FORBIDDEN');
      await client.query(
        "UPDATE agency_memberships SET status='suspended',updated_at=now() WHERE agency_id=$1 AND user_id=$2",
        [agencyId,userId]
      );
      await client.query(
        "INSERT INTO audit_events(id,agency_id,actor_user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,$3,'agency.member.removed','agency_membership',$4,$5::jsonb)",
        [randomUUID(),agencyId,actorId,userId,JSON.stringify({previousRole:current.role})]
      );
      await client.query('COMMIT');
      return true;
    }catch(error){await client.query('ROLLBACK');throw error;}
    finally{client.release();}
  }

}
