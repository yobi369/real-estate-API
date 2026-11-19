import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { pool } from '../db.js';
import type { AgencyRole } from './agency-repository.js';

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

export class AgencyOwnershipTransferRepository {
  async create(agencyId: string, actorId: string, targetUserId: string): Promise<{ id: string; token: string; expiresAt: string }> {
    if (!pool) throw new Error('PERSISTENCE_REQUIRED');
    if (actorId === targetUserId) throw new Error('TRANSFER_TO_SELF');
    const client = await pool.connect();
    const token = randomBytes(32).toString('base64url');
    const id = randomUUID();
    try {
      await client.query('BEGIN');
      await client.query('SELECT id FROM agencies WHERE id=$1 AND status=\'active\' FOR UPDATE', [agencyId]);
      const actor = await client.query<{ role: AgencyRole }>(
        "SELECT role FROM agency_memberships WHERE agency_id=$1 AND user_id=$2 AND status='active' FOR UPDATE",
        [agencyId, actorId]
      );
      if (actor.rows[0]?.role !== 'owner') throw new Error('ACTOR_NOT_OWNER');
      const target = await client.query<{ email: string }>(
        "SELECT u.email FROM agency_memberships m JOIN users u ON u.id=m.user_id WHERE m.agency_id=$1 AND m.user_id=$2 AND m.role='admin' AND m.status='active' FOR UPDATE OF m",
        [agencyId, targetUserId]
      );
      if (!target.rows[0]) throw new Error('TARGET_NOT_ACTIVE_ADMIN');
      await client.query(
        "UPDATE agency_ownership_transfers SET revoked_at=now() WHERE agency_id=$1 AND accepted_at IS NULL AND revoked_at IS NULL",
        [agencyId]
      );
      const inserted = await client.query<{ expires_at: Date }>(
        "INSERT INTO agency_ownership_transfers(id,agency_id,initiated_by,target_user_id,token_hash,expires_at) VALUES($1,$2,$3,$4,$5,now()+interval '48 hours') RETURNING expires_at",
        [id, agencyId, actorId, targetUserId, hashToken(token)]
      );
      await client.query(
        "INSERT INTO audit_events(id,agency_id,actor_user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,$3,'agency.ownership_transfer.created','agency_ownership_transfer',$4,$5::jsonb)",
        [randomUUID(), agencyId, actorId, id, JSON.stringify({ targetUserId: targetUserId, targetEmail: target.rows[0].email, expiresAt: inserted.rows[0]!.expires_at.toISOString() })]
      );
      await client.query('COMMIT');
      return { id, token, expiresAt: inserted.rows[0]!.expires_at.toISOString() };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
  }

  async accept(token: string, userId: string, userEmail: string): Promise<{ agencyId: string; previousOwnerId: string; newOwnerId: string }> {
    if (!pool) throw new Error('PERSISTENCE_REQUIRED');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const tokenHash = hashToken(token);
      const locator = await client.query<{ agency_id: string }>(
        "SELECT agency_id FROM agency_ownership_transfers WHERE token_hash=$1 AND accepted_at IS NULL AND revoked_at IS NULL",
        [tokenHash]
      );
      const agencyId = locator.rows[0]?.agency_id;
      if (!agencyId) throw new Error('TRANSFER_INVALID');
      const agency = await client.query("SELECT id FROM agencies WHERE id=$1 AND status='active' FOR UPDATE", [agencyId]);
      if (!agency.rows[0]) throw new Error('TRANSFER_INVALID');
      const transfer = await client.query<{ id: string; agency_id: string; initiated_by: string; target_user_id: string; expires_at: Date }>(
        "SELECT id,agency_id,initiated_by,target_user_id,expires_at FROM agency_ownership_transfers WHERE token_hash=$1 AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at>now() FOR UPDATE",
        [tokenHash]
      );
      const pending = transfer.rows[0];
      if (!pending) throw new Error('TRANSFER_INVALID');
      if (pending.target_user_id !== userId) throw new Error('TRANSFER_RECIPIENT_MISMATCH');
      const target = await client.query<{ email: string; role: AgencyRole }>(
        "SELECT u.email,m.role FROM agency_memberships m JOIN users u ON u.id=m.user_id WHERE m.agency_id=$1 AND m.user_id=$2 AND m.status='active' FOR UPDATE OF m",
        [pending.agency_id, userId]
      );
      if (!target.rows[0] || target.rows[0].role !== 'admin') throw new Error('TRANSFER_TARGET_NO_LONGER_ADMIN');
      if (target.rows[0].email.trim().toLowerCase() !== userEmail.trim().toLowerCase()) throw new Error('TRANSFER_RECIPIENT_MISMATCH');
      const previousOwner = await client.query<{ role: AgencyRole }>(
        "SELECT role FROM agency_memberships WHERE agency_id=$1 AND user_id=$2 AND status='active' FOR UPDATE",
        [pending.agency_id, pending.initiated_by]
      );
      if (previousOwner.rows[0]?.role !== 'owner') throw new Error('TRANSFER_OWNER_CHANGED');
      await client.query(
        "UPDATE agency_memberships SET role='admin',updated_at=now() WHERE agency_id=$1 AND user_id=$2 AND status='active'",
        [pending.agency_id, pending.initiated_by]
      );
      await client.query(
        "UPDATE agency_memberships SET role='owner',updated_at=now() WHERE agency_id=$1 AND user_id=$2 AND status='active'",
        [pending.agency_id, userId]
      );
      await client.query("UPDATE agency_ownership_transfers SET accepted_at=now() WHERE id=$1", [pending.id]);
      await client.query(
        "INSERT INTO audit_events(id,agency_id,actor_user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,$3,'agency.ownership_transfer.accepted','agency_ownership_transfer',$4,$5::jsonb)",
        [randomUUID(), pending.agency_id, userId, pending.id, JSON.stringify({ previousOwnerId: pending.initiated_by, newOwnerId: userId })]
      );
      await client.query('COMMIT');
      return { agencyId: pending.agency_id, previousOwnerId: pending.initiated_by, newOwnerId: userId };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
  }
}
