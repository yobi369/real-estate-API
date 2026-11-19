# Architecture

## Request flow

1. Express applies Helmet security headers, configured CORS, strict JSON parsing (1 MiB), request IDs, and redacted structured logging.
2. Authentication endpoints use scrypt password hashing and expiring HMAC-SHA256 bearer tokens. Bootstrap, registration, and login have separate process-local rate limits.
3. Public property search and the fictional demo search are rate-limited. Public property reads expose only published inventory.
4. Authenticated write routes resolve `X-Agency-ID` against the caller's active membership before performing tenant-scoped repository operations.
5. Property create/update/delete and publication enforce agency roles. Enquiry inbox reads require an active owner/admin membership and are scoped to that agency.
6. PostgreSQL repositories use parameterized statements. The in-memory adapter is development/test-only and does not satisfy readiness.

## Modules

- `src/domain/property.ts` and `src/domain/inquiry.ts`: request and query schemas.
- `src/auth.ts`: registration, password verification, token issuance/validation, principal middleware, and first-admin bootstrap.
- `src/rate-limit.ts`: reusable bounded-window, process-local request limiter.
- `src/db.ts`: PostgreSQL pool and idempotent schema initialization.
- `src/repositories/property-repository.ts`: published inventory reads and agency-scoped property writes.
- `src/repositories/inquiry-repository.ts`: enquiry persistence and agency routing.
- `src/repositories/agency-repository.ts`: agency creation, active membership lookup, and membership listing.
- `src/app.ts`: HTTP composition, validation, rate limits, and route authorization.
- `src/config.ts`: fail-fast environment validation.
- `scripts/benchmark.mjs`: dependency-free HTTP benchmark runner.
- `tests/`: HTTP, persistence, tenancy, and security regression coverage.

## Tenant model and access boundaries

- Agencies own workspaces; memberships assign owner, admin, agent, or viewer roles.
- `X-Agency-ID` is only a context selector. It grants no access by itself; the API checks the authenticated user's active membership.
- Public listing reads filter to `publication_status='published'`; private agency reads/writes include agency scope.
- Listing enquiries derive their agency from the referenced listing. General enquiries can resolve an active agency by slug.
- Agency onboarding and first-admin bootstrap create the agency, owner membership, and audit event transactionally.
- Listing create/update/delete and publication transitions write audit events in the same PostgreSQL transaction as the listing change. Membership and invitation lifecycle audit coverage remains a production gate.
- Invitation storage exists in the schema, but invitation management/acceptance endpoints are not implemented.

## Data and operational principles

Validate at boundaries, use parameterized SQL, keep public responses free of owner/agency identifiers, enforce tenant scope server-side, and avoid treating a green CI run as proof of production readiness. Process-local rate limits are single-instance controls; use a shared store or edge/WAF enforcement before horizontal scaling.
