import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { pool } from '../db.js';
import type { AgencyRole } from './agency-repository.js';

export type InvitationRole = Exclude<AgencyRole, 'owner'>;
export type AgencyInvitation = { id: string; agencyId: string; email: string; role: InvitationRole; expiresAt: string; createdAt: string };

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

export class AgencyInvitationRepository {
  async create(agencyId: string, actorId: string, email: string, role: InvitationRole): Promise<{ invitation: AgencyInvitation; token: string }> {
    if (!pool) throw new Error('PERSISTENCE_REQUIRED');
    const client = await pool.connect();
    const token = randomBytes(32).toString('base64url');
    const id = randomUUID();
    try {
      await client.query('BEGIN');
      await client.query('SELECT id FROM agencies WHERE id=$1 FOR UPDATE', [agencyId]);
      const actor = await client.query<{ role: AgencyRole }>(
        "SELECT role FROM agency_memberships WHERE agency_id=$1 AND user_id=$2 AND status='active' FOR UPDATE",
        [agencyId, actorId]
      );
      const actorRole = actor.rows[0]?.role;
      if (actorRole !== 'owner' && actorRole !== 'admin') throw new Error('ACTOR_NOT_AUTHORIZED');
      if (actorRole === 'admin' && role === 'admin') throw new Error('INVITATION_ROLE_FORBIDDEN');
      const existing = await client.query(
        "SELECT id FROM agency_invitations WHERE agency_id=$1 AND lower(email)=lower($2) AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at>now() FOR UPDATE",
        [agencyId, email]
      );
      if (existing.rows.length) throw new Error('INVITATION_ALREADY_PENDING');
      const inserted = await client.query<{ id: string; agency_id: string; email: string; role: InvitationRole; expires_at: Date; created_at: Date }>(
        "INSERT INTO agency_invitations(id,agency_id,email,role,token_hash,invited_by,expires_at) VALUES($1,$2,$3,$4,$5,$6,now()+interval '7 days') RETURNING id,agency_id,email,role,expires_at,created_at",
        [id, agencyId, email, role, hashToken(token), actorId]
      );
      await client.query(
        "INSERT INTO audit_events(id,agency_id,actor_user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,$3,'agency.invitation.created','agency_invitation',$4,$5::jsonb)",
        [randomUUID(), agencyId, actorId, id, JSON.stringify({ email, role })]
      );
      await client.query('COMMIT');
      const row = inserted.rows[0]!;
      return { invitation: { id: row.id, agencyId: row.agency_id, email: row.email, role: row.role, expiresAt: row.expires_at.toISOString(), createdAt: row.created_at.toISOString() }, token };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
  }

  async accept(token: string, userId: string, userEmail: string): Promise<{ agencyId: string; role: InvitationRole }> {
    if (!pool) throw new Error('PERSISTENCE_REQUIRED');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query<{ id: string; agency_id: string; email: string; role: InvitationRole }>(
        "SELECT i.id,i.agency_id,i.email,i.role FROM agency_invitations i JOIN agencies a ON a.id=i.agency_id WHERE i.token_hash=$1 AND i.accepted_at IS NULL AND i.revoked_at IS NULL AND i.expires_at>now() AND a.status='active' FOR UPDATE OF i",
        [hashToken(token)]
      );
      const invitation = result.rows[0];
      if (!invitation) throw new Error('INVITATION_INVALID');
      if (invitation.email.trim().toLowerCase() !== userEmail.trim().toLowerCase()) throw new Error('INVITATION_EMAIL_MISMATCH');
      const existingMembership = await client.query<{ role: string; status: string }>(
        'SELECT role,status FROM agency_memberships WHERE agency_id=$1 AND user_id=$2 FOR UPDATE',
        [invitation.agency_id, userId]
      );
      if (existingMembership.rows[0]?.role === 'owner' || existingMembership.rows[0]?.status === 'active') {
        throw new Error('MEMBERSHIP_ALREADY_ACTIVE');
      }
      if (existingMembership.rows[0]) {
        await client.query(
          "UPDATE agency_memberships SET role=$1,status='active',updated_at=now() WHERE agency_id=$2 AND user_id=$3",
          [invitation.role, invitation.agency_id, userId]
        );
      } else {
        await client.query(
          "INSERT INTO agency_memberships(id,agency_id,user_id,role,status) VALUES($1,$2,$3,$4,'active')",
          [randomUUID(), invitation.agency_id, userId, invitation.role]
        );
      }
      await client.query("UPDATE agency_invitations SET accepted_at=now() WHERE id=$1", [invitation.id]);
      await client.query(
        "INSERT INTO audit_events(id,agency_id,actor_user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,$3,'agency.invitation.accepted','agency_invitation',$4,$5::jsonb)",
        [randomUUID(), invitation.agency_id, userId, invitation.id, JSON.stringify({ email: invitation.email, role: invitation.role })]
      );
      await client.query('COMMIT');
      return { agencyId: invitation.agency_id, role: invitation.role };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
  }

  async revoke(agencyId: string, invitationId: string, actorId: string): Promise<boolean> {
    if (!pool) throw new Error('PERSISTENCE_REQUIRED');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT id FROM agencies WHERE id=$1 FOR UPDATE', [agencyId]);
      const actor = await client.query<{ role: AgencyRole }>(
        "SELECT role FROM agency_memberships WHERE agency_id=$1 AND user_id=$2 AND status='active' FOR UPDATE",
        [agencyId, actorId]
      );
      if (actor.rows[0]?.role !== 'owner' && actor.rows[0]?.role !== 'admin') throw new Error('ACTOR_NOT_AUTHORIZED');
      const result = await client.query<{ email: string; role: InvitationRole }>(
        "UPDATE agency_invitations SET revoked_at=now() WHERE id=$1 AND agency_id=$2 AND accepted_at IS NULL AND revoked_at IS NULL RETURNING email,role",
        [invitationId, agencyId]
      );
      const row = result.rows[0];
      if (!row) { await client.query('ROLLBACK'); return false; }
      await client.query(
        "INSERT INTO audit_events(id,agency_id,actor_user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,$3,'agency.invitation.revoked','agency_invitation',$4,$5::jsonb)",
        [randomUUID(), agencyId, actorId, invitationId, JSON.stringify({ email: row.email, role: row.role })]
      );
      await client.query('COMMIT');
      return true;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
  }
}
