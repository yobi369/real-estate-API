# Multi-agency foundation

## Implemented foundation

- `agencies`: agency/workspace identity and lifecycle.
- `agency_memberships`: per-user agency role and membership state.
- `agency_invitations`: expiring, hashed invitation-token storage (no invitation API yet).
- `audit_events`: append-oriented event storage.
- Nullable `agency_id` tenant references on properties and enquiries during compatibility rollout.
- Roles: `owner`, `admin`, `agent`, and `viewer`. Invitation roles exclude owner.

## Existing-data migration

The idempotent schema initialization creates a `legacy-default` agency when users already exist. The oldest existing administrator is selected as its owner; if no administrator exists, the oldest account is selected. Existing administrators receive agency-admin membership, property owners receive agent membership unless they are the selected owner, and existing properties and enquiries are associated with the default agency.

No existing user role is rewritten, no property or enquiry is deleted, and no billing is introduced. When no users exist, the default agency is created by the first-admin/bootstrap transaction instead.

## Implemented API and authorization

- `POST /api/v1/agencies` creates an agency, owner membership, and `agency.created` audit event in one transaction.
- `GET /api/v1/agencies/me` returns only the caller's active memberships in active agencies.
- Authenticated write routes require a valid `X-Agency-ID` and verify active membership in that agency. A caller-supplied ID alone never grants access.
- Property creation allows owner/admin/agent roles; agents may update or delete their own listings; owner/admin can manage agency listings.
- Publication transitions are restricted to owner/admin and are audited transactionally.
- Public property search/detail return only published listings and omit owner and agency identifiers.
- Listing enquiries derive agency routing from the listing record; general enquiries may select an active agency by slug. The inbox is restricted to agency owner/admin and scoped to the selected agency.
- Cross-agency property mutation and enquiry-inbox isolation have regression coverage.

## Audit and invitation boundaries

The current audit trail covers agency creation (including bootstrap), property create/update/delete, and publication transitions. Listing audit events are committed or rolled back with their corresponding listing mutations. Invitation lifecycle and membership administration are not yet covered by audit events. Invitation tables are present, but invitation create/accept/revoke endpoints are not implemented. Do not represent those capabilities as complete.

## Deployment and rollback

- Take and verify a PostgreSQL backup before applying schema changes to customer data.
- Apply schema initialization during a controlled deployment and verify the legacy agency, membership rows, and property/enquiry counts.
- Keep the previous application release available for rollback.
- Application rollback is compatible with additive tables and nullable columns; do not drop new tables or columns during rollback.
- Do not load customer production data until tenant-scoped authorization tests, backup/restore drills, and customer acceptance checks are complete.

## Milestone boundary

The branch now provides the multi-agency schema, onboarding, membership-based context resolution, agency-scoped property writes, publication lifecycle, and agency-scoped enquiry inbox. It does not yet provide invitation workflows, billing, M-Pesa collection, distributed rate limiting, or complete audit coverage. Production onboarding remains blocked on the release gates in [PRODUCTION-READINESS.md](PRODUCTION-READINESS.md).
