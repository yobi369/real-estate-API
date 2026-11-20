# Production Readiness Checklist

This checklist separates implemented controls from external or incomplete release gates. A checked item requires code or CI evidence; it does not imply that a production environment has been provisioned or independently assessed.

## Implemented code and CI evidence

- [x] Versioned TypeScript/Express API with OpenAPI/Swagger and liveness/readiness endpoints.
- [x] PostgreSQL repositories, constraints, indexes, and additive multi-agency schema initialization.
- [x] Development/test in-memory adapter; readiness returns 503 without PostgreSQL.
- [x] Scrypt password hashing, expiring HMAC-signed bearer tokens, and secret-protected first-admin bootstrap.
- [x] Agency onboarding, active membership context resolution, agency-scoped listing writes and private inventory reads, publication lifecycle, scoped enquiry inbox, and owner/admin membership administration with cross-agency isolation and owner protection.
- [x] Authenticated agency console for inventory, enquiries, and team operations.
- [x] Subscription-plan catalog, agency subscription state, and payment ledger schema with owner/admin-only billing summary APIs.
- [x] Daraja STK Push adapter (PayBill), idempotency controls, callback-path secret, callback amount/receipt matching, status-query reconciliation, transactional subscription activation, and end-of-period cancellation. Sandbox credentials and an end-to-end provider test are still outstanding.
- [ ] Verify callback delivery, missing-callback reconciliation, duplicate callbacks, user cancellation, timeouts, and amount mismatch against the Safaricom sandbox; confirm production PayBill onboarding and credentials.
- [x] Public reads restricted to published listings; public responses omit owner and agency identifiers.
- [x] Input validation, Helmet, configured CORS, request IDs, redacted sensitive headers, and bounded JSON body parsing.
- [x] Shared PostgreSQL fixed-window rate-limiting implementation is available in stacked security PR #11: separate namespaces cover bootstrap, registration, login, M-Pesa checkout, public search, and enquiries; client IPs are keyed HMAC digests and production fails closed if the shared store is unavailable. Staging verification and threshold tuning remain outstanding.
- [x] Security regression tests for headers, auth throttling, oversized JSON payload handling, enquiry routing, invitation lifecycle, agency membership authorization/auditing, and two-step ownership transfer. CI evidence is recorded in the latest workflow run.
- [x] Dependency-free HTTP benchmark runner and documented evidence procedure; no production capacity claim has been established.
- [x] CI workflow audits production dependencies and runs typecheck, tests, build, and lint on Node 22/24 with PostgreSQL 16.
- [x] Encrypted PostgreSQL logical-backup and guarded empty-target restore scripts are available in `scripts/backup-postgres.sh` and `scripts/restore-postgres.sh`; PR #12 adds CI integration coverage for encrypted backup, restore, and non-empty-target refusal. See [PostgreSQL operations](POSTGRES-OPERATIONS.md). CI coverage is not an off-host or production restore drill.

## Verified environment snapshot — 2026-11-20

This is a point-in-time, read-only audit. Database row counts were queried without reading customer records.

- Neon production and staging each report only schema migration versions 1 and 2. The agency, subscription, payment-ledger, and distributed rate-limit tables from the current release branches have not been applied to either environment.
- Production row counts: 0 users, 0 properties, 0 enquiries, and 0 media assets.
- Staging row counts: 1 user, 0 properties, 1 enquiry, and 1 media asset. The existing staging records were not inspected or modified.
- Render production service last live deploy: 2026-11-16, commit `43a44ce6dbe5777af767c108563f08a0fae43d4a`. Render staging service last live deploy: 2026-11-15, commit `10c745bb2cdf0d494b6e42d91c7170c9b7ca606c`.
- Both Render services are on the free plan, have automatic deployment disabled, and have no health-check path configured. They are not evidence that the current release branches are deployed or production-ready.
- No database migration, environment-variable change, or deployment was performed during this audit.

## Required before customer production launch

### Infrastructure and database
- [x] Provisioned the Neon production branch and created a least-privilege runtime role; the Render runtime connection is not yet configured or verified, and the current hosting tier/capacity is not approved for a customer SLA.
- [ ] Verify TLS settings for service and database connections in the target host.
- [ ] Store a unique JWT secret and deployment credentials in a managed secret store.
- [ ] Configure automated provider backups/retention and complete an independent encrypted off-host backup plus a restore drill.
- [x] Move schema DDL/backfill out of application startup and provide a separate, explicit migration command using `MIGRATION_DATABASE_URL`.
- [ ] Define migration rollback and deployment ownership; configure the Render runtime service to use the least-privilege `DATABASE_URL` role.
- [ ] Configure CORS to the customer's approved origins and verify proxy trust settings.
- [ ] Confirm the production service plan, availability characteristics, health checks, monitoring, and capacity are suitable for the agreed customer SLA.

### Identity and application security
- [ ] Verify the shared PostgreSQL rate limiter in staging, tune thresholds, monitor database load, and retain edge/WAF protection for volumetric attacks; review proxy trust configuration for the actual hosting topology.
- [ ] Implement email verification, secure password reset, token revocation/rotation, and account/session lifecycle controls.
- [x] Record authenticated owner/admin payment status-query reconciliation in the agency audit log with actor attribution; agency, listing, invitation, ownership-transfer, membership, and subscription-cancellation mutations are also covered.
- [ ] Complete an independent audit-coverage review for all privileged operations.
- [x] Implement invitation create/accept/revoke endpoints with hashed expiring tokens, email matching, and transactional audit events.
- [x] Implement owner-initiated, recipient-accepted ownership transfer with hashed 48-hour tokens, same-agency active-admin eligibility, transactional role swap, and audit events.
- [ ] Complete dependency, secret, and static-analysis review and resolve material findings.
- [ ] Conduct independent authorization review and penetration testing.
- [ ] Validate request timeouts, payload limits, and failure handling in the deployed environment.

### Reliability and performance
- [ ] Run the documented benchmark against representative staging property-search and authenticated-write workloads.
- [ ] Record region, instance size, database tier, concurrency, request count, p50/p95/p99, error rate, and raw JSON output.
- [ ] Add central monitoring, alerting, database-capacity monitoring, and an incident response owner.
- [ ] Test deployment rollback and database restore procedures.
- [ ] Verify live health/readiness, OpenAPI, and critical API flows after deployment.

### Commercial billing and API monetization
- [x] Confirmed initial monthly KES prices: Starter KSh 2,500; Professional KSh 5,000; Business KSh 12,000. Plans are seeded inactive.
- [x] Approve and seed Starter (25 listings/3 seats), Professional (100 listings/10 seats), and Business (500 listings/30 seats) quotas; plans remain inactive pending payment acceptance.
- [x] Enforce listing/team-seat quotas for agencies with a current paid/trial subscription; drafts and published listings count, archived listings do not, and active members plus pending invitations consume seats.
- [x] Require a current paid/trial subscription for new listings and team invitations; existing inventory remains readable.
- [ ] Approve and implement the proposed expiry policy: at paid-period end, immediately block new listings and invitations while preserving access to existing inventory and enquiries; provide a 7-calendar-day renewal/support grace window; after that window keep the workspace read-only with data export available; restore write access only after a verified payment. No data is automatically deleted for non-payment.
- [ ] Define trial eligibility, refunds, cancellation handling, and customer communications; paid API access remains a separate product.
- [ ] Verify Daraja sandbox and production acceptance gates in [M-Pesa integration](MPESA-INTEGRATION.md); configure credentials only in the managed secret store.
- [ ] Build API-key issuance/revocation, developer accounts, usage metering, per-plan quotas, and paid API access as the second commercial product.

### Customer and data governance
- [ ] Agree data controller/processor responsibilities and applicable Kenyan data-protection obligations with the customer.
- [ ] Document permitted fields, purpose, retention, deletion, and access rules.
- [ ] Confirm listing accuracy, rights to publish, and client approval workflow.
- [ ] Define data export/exit and access revocation at contract end.
- [ ] Sign off customer acceptance tests using authorised test data.
- [ ] Obtain written approval before loading live customer or personal data.

## Demo safeguards

- [x] Fictional sample inventory is separate from operational customer listings.
- [x] Demo search is read-only.
- [ ] Verify deployed demo, Swagger UI, and OpenAPI endpoints after deployment.
- [ ] Check screenshots/sample records for secrets and personal/customer information.

## Proposed operational service objectives (approval required)

For the first controlled customer pilot, use these as planning targets—not achieved guarantees—until the operator, customer, and hosting plan approve them:

- Recovery point objective (RPO): no more than 24 hours of data loss.
- Recovery time objective (RTO): restore critical service within 8 hours.
- Encrypted independent logical backup: at least daily, with a proposed 30-day retention window and a separate off-host copy.
- Run a restore drill at least quarterly and after material backup/restore changes; record actual achieved RPO/RTO and evidence.
- If the selected hosting tier or backup workflow cannot meet these targets, revise the customer SLA before onboarding.

## Release decision

**Current status: demonstration candidate; not approved for customer production data.** A production go-live requires evidence for all applicable gates, a named customer owner, approved deployment plan, and signed acceptance criteria. Record risk exceptions explicitly.
