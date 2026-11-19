# Production Readiness Checklist

This checklist separates implemented controls from external or incomplete release gates. A checked item requires code or CI evidence; it does not imply that a production environment has been provisioned or independently assessed.

## Implemented code and CI evidence

- [x] Versioned TypeScript/Express API with OpenAPI/Swagger and liveness/readiness endpoints.
- [x] PostgreSQL repositories, constraints, indexes, and additive multi-agency schema initialization.
- [x] Development/test in-memory adapter; readiness returns 503 without PostgreSQL.
- [x] Scrypt password hashing, expiring HMAC-signed bearer tokens, and secret-protected first-admin bootstrap.
- [x] Agency onboarding, active membership context resolution, agency-scoped listing writes, publication lifecycle, scoped enquiry inbox, and owner/admin membership administration with cross-agency isolation and owner protection.
- [x] Public reads restricted to published listings; public responses omit owner and agency identifiers.
- [x] Input validation, Helmet, configured CORS, request IDs, redacted sensitive headers, and bounded JSON body parsing.
- [x] Process-local rate limits for bootstrap, registration, login, public search/demo, and enquiries; limits are not distributed.
- [x] Security regression tests for headers, auth throttling, oversized JSON payload handling, enquiry routing, invitation lifecycle, and agency membership authorization/auditing (43 tests passed across 5 files on Node 22/24 with PostgreSQL 16; see QUALITY-EVIDENCE.md).
- [x] Dependency-free HTTP benchmark runner and documented evidence procedure; no production capacity claim has been established.
- [x] CI workflow audits production dependencies and runs typecheck, tests, build, and lint on Node 22/24 with PostgreSQL 16.

## Required before customer production launch

### Infrastructure and database
- [ ] Provision dedicated production PostgreSQL and a least-privilege DB role.
- [ ] Verify TLS settings for service and database connections in the target host.
- [ ] Store a unique JWT secret and deployment credentials in a managed secret store.
- [ ] Configure automated backups/retention and complete a restore drill.
- [ ] Define controlled migration execution, rollback, and deployment ownership.
- [ ] Configure CORS to the customer's approved origins and verify proxy trust settings.

### Identity and application security
- [ ] Replace process-local rate limits with shared/distributed enforcement or an edge/WAF equivalent before scaling horizontally.
- [ ] Implement email verification, secure password reset, ownership transfer, token revocation/rotation, and account/session lifecycle controls.
- [ ] Extend audit events to remaining privileged operations and complete the independent audit-coverage review; agency, listing, invitation, and membership mutations are covered.
- [x] Implement invitation create/accept/revoke endpoints with hashed expiring tokens, email matching, and transactional audit events.
- [ ] Complete dependency, secret, and static-analysis review and resolve material findings.
- [ ] Conduct independent authorization review and penetration testing.
- [ ] Validate request timeouts, payload limits, and failure handling in the deployed environment.

### Reliability and performance
- [ ] Run the documented benchmark against representative staging property-search and authenticated-write workloads.
- [ ] Record region, instance size, database tier, concurrency, request count, p50/p95/p99, error rate, and raw JSON output.
- [ ] Add central monitoring, alerting, database-capacity monitoring, and an incident response owner.
- [ ] Test deployment rollback and database restore procedures.
- [ ] Verify live health/readiness, OpenAPI, and critical API flows after deployment.

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

## Release decision

**Current status: demonstration candidate; not approved for customer production data.** A production go-live requires evidence for all applicable gates, a named customer owner, approved deployment plan, and signed acceptance criteria. Record risk exceptions explicitly.
