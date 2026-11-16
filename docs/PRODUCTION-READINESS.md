# Production Readiness Checklist

This checklist separates existing engineering capabilities from work still required before a customer production deployment. A checked item is not implied by the existence of a code path; retain evidence for each completed gate.

## Current implementation evidence

- [x] TypeScript/Express REST API with versioned `/api/v1` routes.
- [x] PostgreSQL repository with constraints and indexes when `DATABASE_URL` is configured.
- [x] Ephemeral in-memory adapter restricted to development/test; readiness returns 503 without PostgreSQL.
- [x] Password hashing using Node.js scrypt.
- [x] Expiring HMAC-signed bearer tokens and owner/admin checks for listing writes.
- [x] Input validation, Helmet headers, bounded JSON body, configurable CORS and redacted authorization logging.
- [x] Health/readiness endpoints and Swagger UI/OpenAPI endpoint.
- [x] CI verification against Node 22/24 and PostgreSQL 16 (see QUALITY-EVIDENCE.md).
- [x] Isolated fictional sample data and read-only search endpoint for the public demonstration.

## Required before any customer production launch

### Infrastructure and database
- [ ] Provision a dedicated production PostgreSQL instance and least-privilege database role.
- [ ] Enforce TLS for client-to-service and service-to-database connections.
- [ ] Configure managed secrets; generate a unique production JWT secret.
- [ ] Define automated backups, retention, point-in-time recovery where available, and perform a restore drill.
- [ ] Define migration execution, rollback strategy and deployment ownership.
- [ ] Configure production CORS to only the customer's approved origins.

### Identity and application security
- [ ] Add rate limiting and abuse controls for authentication and public search.
- [ ] Implement email verification and secure password reset.
- [ ] Define token revocation/rotation and account/session lifecycle.
- [ ] Review admin provisioning and add auditable operator actions.
- [ ] Add security audit events for sensitive listing and account changes.
- [ ] Complete dependency, secret and static-analysis scans; resolve material findings.
- [ ] Conduct independent security review and penetration testing.
- [ ] Confirm request timeouts, payload limits and safe error handling under failure.

### Reliability and operations
- [ ] Add centralised monitoring, structured alerting and an incident response owner.
- [ ] Add uptime, latency, error-rate and database-capacity monitoring.
- [ ] Perform load and concurrency testing against agreed usage assumptions.
- [ ] Document service recovery, escalation and support hours.
- [ ] Test deployment rollback and database restore procedures.
- [ ] Confirm production health/readiness behaviour after deployment.

### Customer and data governance
- [ ] Agree data controller/processor responsibilities and applicable Kenyan data-protection obligations with the customer.
- [ ] Document permitted data fields, purpose, retention, deletion and access rules.
- [ ] Confirm property listing accuracy, rights to publish, and client approval workflow.
- [ ] Define ownership of client data, export/exit procedure and access revocation at contract end.
- [ ] Sign off client-specific acceptance tests using authorised test data before migration.
- [ ] Obtain written approval before loading any live customer or personal data.

## Demo-specific safeguards

- [x] Demo inventory is fictional and separated from the customer property repository.
- [x] Demo endpoint is read-only and supports search/filter/pagination.
- [ ] Verify the deployed demo URL and all sample queries after deployment.
- [ ] Confirm Swagger UI and OpenAPI endpoint are reachable from the public host.
- [ ] Ensure no secrets, private customer data or real property contact details appear in screenshots or sample records.

## Release decision

**Current status:** Demonstration candidate, not approved for production customer data.

A production go-live requires evidence for every applicable unchecked item, a named customer owner, an approved deployment plan and signed acceptance criteria. Record exceptions and risk acceptance explicitly rather than silently waiving a gate.
