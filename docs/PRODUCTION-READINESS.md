# Production Readiness Checklist

This checklist separates implemented controls from external or incomplete release gates. A checked item requires code or CI evidence; it does not imply that production infrastructure has been provisioned or independently assessed.

## Implemented code and CI evidence

- [x] Versioned TypeScript/Express API with OpenAPI/Swagger, service discovery, liveness, and database readiness endpoints.
- [x] PostgreSQL repositories, constraints, indexes, multi-agency schema, audit events, subscription/payment tables, and shared rate-limit table.
- [x] Development/test in-memory adapter; readiness returns 503 without PostgreSQL.
- [x] Explicit transactional migration command; application startup does not run schema DDL.
- [x] Scrypt password hashing, expiring HMAC-signed bearer tokens, persisted per-session records, session inventory, individual session revocation, and secret-protected one-time first-admin bootstrap.
- [x] Agency onboarding, active membership context resolution, agency-scoped listing writes/private inventory, publication lifecycle, scoped enquiry inbox, member administration, invitation lifecycle, and two-step ownership transfer.
- [x] Public reads restricted to published listings; public responses omit owner and agency identifiers.
- [x] Authenticated agency console for inventory, enquiries, and team operations; fictional buyer demo is read-only and isolated from customer listings.
- [x] Subscription-plan catalog, agency subscription state, payment ledger, and owner/admin billing APIs.
- [x] Daraja STK Push PayBill adapter, idempotency controls, callback-path secret, callback amount/receipt matching, status-query reconciliation, transactional subscription activation, and end-of-period cancellation. Sandbox credentials and provider E2E tests remain outstanding.
- [x] Listing and team-seat quota enforcement for agencies with a current paid/trial subscription.
- [x] Input validation, Helmet, configured CORS, request IDs, redacted sensitive headers/URLs, bounded JSON body parsing, and administrator-only validated image uploads.
- [x] PostgreSQL-backed distributed fixed-window rate limits for bootstrap, registration, login, M-Pesa checkout/reconciliation, public search/demo, and enquiries. Production fails closed if the shared store is unavailable; client addresses are keyed HMAC digests rather than raw IPs.
- [x] Proxy trust configured for the observed three-hop Render staging topology, with a forged-X-Forwarded-For regression test. Revalidate if hosting topology changes.
- [x] Security regression tests for headers, authentication throttling, oversized JSON, enquiry routing, agency isolation/authorization, invitation lifecycle, ownership transfer, shared rate-limit counters, address privacy, and runtime DB privileges.
- [x] Encrypted PostgreSQL logical-backup and guarded restore scripts. CI performs a disposable PostgreSQL 16 encrypted backup/restore round-trip and refuses to overwrite a populated target.
- [x] CI audits dependencies and runs typecheck, tests, build, lint, and PostgreSQL operations checks on Node.js 22, 24, and 26.

## Required before customer production launch

### Infrastructure and database

- [ ] Provision dedicated production PostgreSQL and a least-privilege DB role.
- [ ] Verify TLS settings for service and database connections in the target host.
- [ ] Store unique JWT, database, deployment, and provider secrets in a managed secret store.
- [ ] Configure provider-managed backups/retention and complete an independent encrypted off-host logical backup plus a restore drill.
- [ ] Define controlled migration execution, rollback, and deployment ownership. The current migration foundation is transactional/idempotent but not yet decomposed into independently versioned migration files.
- [ ] Confirm the production service plan, availability characteristics, health checks, monitoring, alerting, and capacity are suitable for the agreed customer SLA. The current free staging instance can hibernate and is not production-grade.
- [ ] Configure approved CORS origins and verify proxy trust settings in the final hosting topology.

### Identity and application security

- [ ] Implement email verification, secure password reset/account recovery, refresh-token rotation, and account abuse/lockout workflows. Per-session inventory and revocation are implemented.
- [ ] Complete independent authorization review, penetration testing, and audit-event coverage review.
- [ ] Complete dependency, secret, static-analysis, and runtime review; resolve material findings.
- [ ] Validate request timeouts, payload limits, and failure handling in the deployed environment.
- [ ] Configure edge/WAF and DDoS protection; shared rate limits are not volumetric attack protection.

### Reliability and performance

- [ ] Run representative staging benchmarks for public property search and authenticated agency writes.
- [ ] Record region, instance size, database tier, concurrency, request count, p50/p95/p99, error rate, and raw JSON output.
- [ ] Add central monitoring, alerting, database-capacity monitoring, and a named incident response owner.
- [ ] Test deployment rollback and an operator-run database restore with application-level verification.
- [ ] Re-run direct GET smoke tests for /health/live, /health/ready, /docs/, /openapi.json, and critical API workflows after the final candidate deployment.

### Commercial billing

- [x] Initial monthly prices and plan allowances are defined: Starter KSh 2,500 (25 listings/3 seats), Professional KSh 5,000 (100 listings/10 seats), Business KSh 12,000 (500 listings/30 seats).
- [x] Plans are seeded inactive and listing/team-seat gates require a current paid/trial subscription.
- [ ] Approve trial, grace-period, expiry, refund, cancellation, support, and access-restoration terms before activation.
- [ ] Complete Daraja sandbox tests for successful payment, cancellation, duplicate callback, delayed/missing callback, timeout/unknown outcome, amount mismatch, and status-query reconciliation.
- [ ] Complete Safaricom production PayBill onboarding and configure credentials only in the managed secret store.
- [ ] Build API-key issuance/revocation, developer accounts, usage metering, quotas, and paid API access as a separately scoped product. These are not implemented.

### Customer and data governance

- [ ] Agree data controller/processor responsibilities and applicable Kenyan data-protection obligations with the customer.
- [ ] Document permitted fields, purpose, retention, deletion, export, and access rules.
- [ ] Confirm listing accuracy, rights to publish, and client approval workflow.
- [ ] Define data export/exit and access revocation at contract end.
- [ ] Sign off customer acceptance tests using authorised synthetic/test data.
- [ ] Obtain written approval before loading live customer or personal data.

## Demo safeguards

- [x] Fictional sample inventory is separate from operational customer listings.
- [x] Demo search is read-only.
- [ ] Verify deployed demo, Swagger UI, and OpenAPI endpoints after the final candidate deployment.
- [ ] Check screenshots/sample records for secrets and personal/customer information.

## Current release decision

**Status: staging demonstration candidate; not approved for customer production data.** The staging service is separate from production and is not a production SLA environment. Production remains unprovisioned/untouched for this workstream. A go-live requires evidence for all applicable gates, an approved deployment plan, named operational ownership, and signed customer acceptance.