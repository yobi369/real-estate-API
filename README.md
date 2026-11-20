# Real Estate API

A documented TypeScript/Express REST API for property discovery and listing management, with a buyer-facing interactive demonstration using fictional Kenyan sample records.

## Product demonstration

After deployment, visit:

- `/demo/` — interactive property search showcase (fictional sample records only).
- `/console/` — authenticated agency workspace for private inventory, publication controls, enquiries and team access.
- `/docs/` — Swagger UI.
- `/openapi.json` — OpenAPI document.
- `/health/live` — process liveness.
- `/health/ready` — database readiness.

The demo inventory is isolated from customer listings. It is not a live marketplace and does not represent actual property offers, valuations or availability.

## Current engineering capabilities

- Property create/read/search/update/delete endpoints with validation, bounded pagination, filtering and consistent errors.
- PostgreSQL persistence with foreign-key/field constraints and indexes when `DATABASE_URL` is set; in-memory fallback is development/test only.
- Email/password registration and login, scrypt password hashing, expiring HMAC-signed bearer tokens, administrator-only listing publication, one-time first-admin bootstrap, and owner/admin authorization for modifications.
- Multi-agency tenancy with agency-scoped listing and enquiry access, email-bound invitations, owner/admin membership controls, and two-step recipient-accepted ownership transfer.
- Public enquiry submission with PostgreSQL persistence and an agency-scoped owner/admin enquiry inbox.
- PostgreSQL-backed distributed fixed-window rate limits for authentication, billing checkout, public search, and enquiries; production fails closed if the shared store is unavailable, and client IPs are stored as keyed HMAC digests rather than raw addresses.
- Health/readiness checks, OpenAPI/Swagger, GitHub Actions CI on Node 22/24 with PostgreSQL 16, and documented production gates.
- Read-only demo endpoint at `GET /demo/properties`, with city, type, transaction, price and text filters.

## Quick start

```bash
cp .env.example .env
# Configure DATABASE_URL and replace JWT_SECRET with a random secret
npm install
npm run db:migrate
npm run dev
```

The API does not run schema DDL at startup. Run `npm run db:migrate` explicitly before starting the application. For production, provide a least-privilege `DATABASE_URL`, a separate privileged `MIGRATION_DATABASE_URL` to the one-off migration job, and a unique JWT secret. Set a temporary `ADMIN_BOOTSTRAP_TOKEN` (at least 32 characters) to create the first agency administrator through `POST /api/v1/admin/bootstrap`, then remove the token from the environment. Only administrators can publish listings. Without a database, readiness returns 503 and only the ephemeral development adapter is available.

## Verify

```bash
npm run verify
```

## Commercial pilot

See [the integration pilot proposal](docs/COMMERCIAL-PILOT-PROPOSAL.md) for the indicative scope, pricing and commercial boundaries.

## Agency billing foundation

- `GET /api/v1/billing/plans` returns active subscription plans.
- `GET /api/v1/billing/subscription` returns the selected agency's current subscription and recent payment history (owner/admin only; requires `X-Agency-ID`).
- `POST /api/v1/billing/mpesa/stk-push` starts an idempotent Daraja checkout for an active plan (owner/admin only; requires `X-Agency-ID` and `Idempotency-Key`).
- Daraja callbacks are accepted at the configured unguessable callback path; the payment is matched to the pending checkout, KES amount and receipt before the subscription is activated.
- `POST /api/v1/billing/payments/{paymentId}/reconcile` performs an owner/admin-triggered STK status query when a callback is delayed or missing; confirmed status is applied idempotently.
- `POST /api/v1/billing/subscription/cancel` schedules cancellation at the end of the current paid period.
- Configure all `MPESA_*` settings together in the secret store. Callback URLs must be public HTTPS origins. The current STK adapter is PayBill-only. Till/Buy Goods collection needs a separately verified Daraja API flow.
- Starter (KSh 2,500/month: 25 active listings, 3 team seats), Professional (KSh 5,000/month: 100 active listings, 10 team seats), and Business (KSh 12,000/month: 500 active listings, 30 team seats) are seeded as inactive plans. The API requires a current paid/trial subscription to create new listings or invite team members, and enforces the selected plan's listing and seat limits. Existing inventory remains stored and readable; no automatic free tier is promised. Listing counts include drafts and published listings but exclude archived listings; team seats include active memberships and unexpired pending invitations. Subscription/grace-period policy for expiry and access restoration remains a go-live decision. API request quotas and paid API access are not included. No Daraja credentials are configured in this repository, so sandbox/production end-to-end payment verification is still outstanding.

## Production deployment

See [the production-readiness checklist](docs/PRODUCTION-READINESS.md) before using customer or personal data. The public demo is not a production customer environment. The agency console is a product workflow foundation; billing, automated invitation email, and production customer onboarding remain separate release gates.

## Technical documentation

- [Architecture](docs/ARCHITECTURE.md)
- [API contract](docs/API.md)
- [Security model](docs/SECURITY.md)
- [Testing](docs/TESTING.md)
- [Deployment](docs/DEPLOYMENT.md)
- [Quality evidence](docs/QUALITY-EVIDENCE.md)
- [M-Pesa integration](docs/MPESA-INTEGRATION.md)
- [Changelog](CHANGELOG.md)
