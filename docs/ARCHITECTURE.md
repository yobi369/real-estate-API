# Architecture

## Request flow

1. Express applies Helmet security headers, configured CORS, strict JSON parsing (1 MiB), request IDs, and structured logging with authorization, cookies, bootstrap headers, and request URLs redacted.
2. Registration and login use scrypt password hashing. Bearer tokens are HMAC-SHA256 signed and expire after the configured TTL (one hour by default).
3. Authenticated agency operations resolve X-Agency-ID against the caller's active membership. The header selects context; it never grants access by itself.
4. Property writes, private inventory reads, membership operations, invitations, ownership transfers, enquiries, and billing are scoped to the selected agency and the caller's role.
5. Public property reads expose published inventory only. Public responses omit internal owner and agency identifiers.
6. Rate limits use PostgreSQL fixed-window counters shared by application replicas. Client addresses are represented by keyed HMAC-SHA256 digests. Production fails closed with HTTP 503 when the shared store is unavailable; memory fallback is restricted to development/test.
7. PostgreSQL access uses parameterized statements. The runtime pool uses DATABASE_URL; schema changes run separately through the explicit migration command and MIGRATION_DATABASE_URL.

## Modules

- src/domain/property.ts and src/domain/inquiry.ts: request and query schemas.
- src/auth.ts: registration, password verification, token issuance/validation, principal middleware, and first-admin bootstrap.
- src/rate-limit.ts: bounded PostgreSQL-backed fixed-window rate limiting with development/test fallback.
- src/db.ts and src/migrate.ts: runtime database pool, schema readiness, and explicit migration execution.
- src/repositories/property-repository.ts: public published inventory and agency-scoped private inventory, writes, publication, quotas, and audit events.
- src/repositories/inquiry-repository.ts: enquiry persistence, listing linkage, and agency routing.
- src/repositories/agency-repository.ts: agency onboarding, active memberships, role changes, member removal, and audit events.
- src/repositories/agency-invitation-repository.ts: email-bound, hashed, expiring invitations with accept/revoke workflows.
- src/repositories/agency-ownership-transfer-repository.ts: recipient-accepted ownership transfer with hashed, expiring tokens.
- src/repositories/subscription-repository.ts and subscription-payment-repository.ts: plan catalog, subscription state, payment ledger, idempotency, callback processing, reconciliation, quotas, and billing audit events.
- src/services/mpesa.ts: Safaricom Daraja OAuth, PayBill STK Push, callback parsing, and STK status query.
- src/app.ts: HTTP composition, OpenAPI, validation, rate limits, and route authorization.
- public/demo and public/console: fictional read-only buyer demo and authenticated agency workspace.
- scripts/backup-postgres.sh and scripts/restore-postgres.sh: encrypted logical backup and guarded restore.
- scripts/benchmark.mjs: dependency-free HTTP benchmark runner.
- tests/: HTTP, persistence, tenancy, billing, rate-limit, backup/restore, and security regression coverage.

## Tenant model and access boundaries

- Agencies own workspaces; memberships assign owner, admin, agent, or viewer roles.
- X-Agency-ID is only a context selector. The API checks the authenticated user's active membership on every agency-scoped request.
- Public listing reads filter to published listings; private agency inventory includes drafts and archived records and remains agency-scoped.
- Owners and admins can manage agency inventory. Agents can create listings and modify/delete their own listings. Viewers cannot write.
- Only owners/admins can publish, manage members, manage billing, invite users, or initiate billing reconciliation. Admins cannot grant admin roles or manage other admins.
- Invitation tokens are stored as hashes, expire after seven days, are email-bound, and cannot be reused after acceptance or revocation. Automated email delivery is not configured; delivery is currently manual.
- Ownership transfer requires the current owner to nominate an active admin. The recipient must accept within 48 hours; the previous owner becomes an admin. Tokens are hashed and single-use.
- Listing create/update/delete/publication, agency creation, membership changes, invitation lifecycle, ownership transfer, subscription cancellation, and payment reconciliation write transactional audit events.
- Public listing responses omit owner and agency identifiers. Customer enquiry records are routed to the listing's agency or an explicitly selected active agency slug.

## Subscription and payment model

- Starter, Professional, and Business plans are seeded at KSh 2,500, KSh 5,000, and KSh 12,000 per month, with 25/3, 100/10, and 500/30 listing/member allowances respectively.
- Plans are seeded inactive. A plan must be activated by an authorised operator after commercial and payment acceptance gates are met.
- New listing creation and team invitations require a current paid/trial subscription. Draft and published listings count toward listing allowances; archived listings do not. Active memberships and unexpired pending invitations consume team seats.
- Daraja integration currently implements customer-to-business PayBill STK Push. Payment attempts are idempotent. A subscription activates only after a verified callback or status query matches the expected checkout, amount, and receipt.
- Callback credentials, Daraja credentials, approved PayBill onboarding, sandbox testing, refunds, grace-period policy, and customer terms remain external release decisions. Till/Buy Goods is not implemented.

## Database and operational principles

- PostgreSQL schema version 5 is required by readiness, including agency, subscription, payment, audit, and shared rate-limit tables.
- Application startup does not run schema DDL. Run the explicit migration command as a controlled one-off operation using the migration role.
- The current migration implementation is an idempotent transactional schema foundation, not yet a set of independently versioned migration files. Test changes on an isolated branch and retain operator-controlled rollback planning.
- Keep runtime database privileges restricted. Do not store migration-owner credentials in the long-running service.
- The Render proxy trust count is set to three based on the observed staging chain (client, Cloudflare, Render proxy, loopback socket). Revalidate whenever the hosting or proxy topology changes.
- Shared rate limiting protects application-level abuse across replicas but does not replace an edge WAF or volumetric DDoS protection.
- A green CI run is not proof of production readiness, customer acceptance, a completed backup drill, or independent security assurance.
