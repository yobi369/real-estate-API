# Real Estate API

A documented TypeScript/Express REST API for property discovery and listing management, with a buyer-facing interactive demonstration using fictional Kenyan sample records and a multi-agency workspace for commercial property operators.

## Product demonstration

After deployment, visit:

- /demo/ — interactive property search showcase (fictional sample records only).
- /console/ — authenticated agency workspace for private inventory, publication controls, enquiries, billing, and team access.
- /docs/ — Swagger UI.
- /openapi.json — OpenAPI document.
- /health/live — process liveness.
- /health/ready — database readiness.

The demo inventory is isolated from customer listings. It is not a live marketplace and does not represent actual property offers, valuations, or availability.

## Current engineering capabilities

- Property create/read/search/update/delete endpoints with validation, bounded pagination, filtering, publication lifecycle, and consistent errors.
- PostgreSQL persistence with constraints, indexes, transactional schema migration, and a development/test-only in-memory adapter.
- Email/password registration and login, scrypt password hashing, expiring HMAC-signed bearer tokens, server-side session inventory and individual revocation, one-time secret-protected first-admin bootstrap, single-use password reset tokens, and persistent account lockout.
- Multi-agency tenancy with agency-scoped listing and enquiry access, email-bound invitations, role administration, audit events, and recipient-accepted ownership transfer.
- PostgreSQL-backed distributed rate limits across authentication, M-Pesa checkout, public search, and enquiries; production fails closed if the shared store is unavailable, and client addresses are stored as keyed HMAC digests rather than raw IPs.
- Agency subscription and payment ledger foundation, plan quotas, Daraja PayBill STK Push, idempotent payment attempts, callback validation, status-query reconciliation, and cancellation scheduling.
- PostgreSQL-backed image uploads, health/readiness checks, OpenAPI/Swagger, and CI on Node.js 22/24/26 with PostgreSQL 16.
- Encrypted PostgreSQL logical-backup and guarded restore scripts with a disposable PostgreSQL 16 backup/restore integration test in CI.

## Quick start

    cp .env.example .env
    # Configure DATABASE_URL and replace JWT_SECRET with a random secret
    npm install
    npm run db:migrate
    npm run dev

The API does not run schema DDL at startup. Run npm run db:migrate explicitly before starting the application. For production, provide a least-privilege DATABASE_URL, a separate privileged MIGRATION_DATABASE_URL to a controlled one-off migration job, and a unique JWT secret. Set a temporary ADMIN_BOOTSTRAP_TOKEN (at least 32 characters) to create the first agency administrator through POST /api/v1/admin/bootstrap, then remove the token from the environment. Without PostgreSQL, readiness returns 503 and only the ephemeral development adapter is available.

## Verify

    npm run verify

## Agency billing foundation

Initial monthly prices and allowances are Starter KSh 2,500 (25 listings/3 team seats), Professional KSh 5,000 (100 listings/10 seats), and Business KSh 12,000 (500 listings/30 seats). Plans are seeded inactive and must not be activated until commercial terms and payment acceptance gates are approved.

The API requires a current paid/trial subscription to create new listings or invite team members. Draft and published listings count toward listing limits; archived listings do not. Active memberships and unexpired pending invitations consume team seats.

Daraja integration currently supports customer-to-business PayBill STK Push. Payment attempts are idempotent; subscriptions activate only after a verified callback or status query matches the expected checkout and amount. Sandbox credentials, production PayBill onboarding, and end-to-end provider testing remain outstanding. Till/Buy Goods, refunds, API-key issuance, usage metering, and paid API access are not implemented.

## Production deployment

See docs/PRODUCTION-READINESS.md before using customer or personal data. The public demo is not a production customer environment. The agency workspace and billing foundations are implemented. Password recovery code is present, but live email delivery requires a verified sender and provider credentials; email verification, independent security assurance, backup/restore operations, infrastructure, and customer onboarding remain release gates.

## Technical documentation

- docs/ARCHITECTURE.md
- docs/API.md
- docs/SECURITY.md
- docs/TESTING.md
- docs/DEPLOYMENT.md
- docs/PRODUCTION-READINESS.md
- docs/POSTGRES-OPERATIONS.md
- docs/MPESA-INTEGRATION.md
- docs/QUALITY-EVIDENCE.md
- CHANGELOG.md
