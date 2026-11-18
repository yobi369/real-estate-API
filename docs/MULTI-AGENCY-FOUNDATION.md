# Multi-agency foundation

## Purpose

Prepare Real Estate API for multiple independent agencies while preserving the existing Secure Properties deployment and its current records.

## Schema introduced

- `agencies`: agency/workspace identity and lifecycle.
- `agency_memberships`: one user's role and membership state within an agency.
- `agency_invitations`: expiring, hashed invitation-token records.
- `audit_events`: append-oriented audit event storage.
- `properties.agency_id` and `inquiries.agency_id`: nullable tenant references during the compatibility phase.

Supported agency membership roles are `owner`, `admin`, `agent` and `viewer`. Invitation roles exclude `owner`; ownership must not be granted by an invitation token.

## Existing-data migration

When existing users are present, the migration creates a `legacy-default` agency. The oldest existing administrator is selected as its owner; if no administrator exists, the oldest account is selected. Existing administrators receive agency-admin membership, property owners receive agent membership unless they are the selected owner, and existing properties and enquiries are associated with the default agency.

The migration is additive and idempotent. Tenant columns remain nullable and the legacy API continues to operate while authorization and repository scoping are implemented in subsequent changes. No existing user role is rewritten, no property or enquiry is deleted, and no billing is introduced.

If the database has no users when this migration runs, no default agency is created. The first-admin/bootstrap flow must establish the initial agency before agency-managed listings are enabled.

## Security rules for the next implementation steps

1. Resolve agency context from the authenticated user's active membership, never from a client-supplied agency ID.
2. Enforce role permissions in server-side middleware and repository queries.
3. Scope every private property and enquiry read/write by agency ID.
4. Keep public marketplace reads limited to intentionally published/approved listings.
5. Add negative tests proving Agency A cannot read or mutate Agency B records.
6. Record sensitive membership, listing and agency changes in `audit_events`.

## Deployment and rollback

- Take and verify a PostgreSQL backup before production migration.
- Apply the additive schema migration during a controlled deployment.
- Verify the `legacy-default` agency, membership rows and property/enquiry counts.
- Keep the previous application release available for rollback.
- Application rollback is compatible because old code ignores the new tables and nullable columns.
- Do not drop the new tables or columns as part of an application rollback. Restore from a verified backup only if database-level recovery is required.
- Do not load new customer production data until tenant-scoped authorization and cross-agency isolation tests pass.

## Current milestone boundary

This change establishes the database foundation only. It does **not** yet provide agency registration, invitations, tenant-aware JWT claims, tenant-scoped API authorization, subscription billing or M-Pesa collection. Those remain separate acceptance gates.
