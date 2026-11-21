# Changelog

## Unreleased — 2026-11-21

### Added
- Multi-agency workspaces with owner/admin/agent/viewer roles, tenant-scoped inventory and enquiry access, member administration, hashed email-bound invitations, and recipient-accepted ownership transfer.
- Agency subscription plans, payment ledger, plan-based listing and team-seat quotas, and billing APIs.
- Safaricom Daraja PayBill STK Push foundation with idempotent attempts, protected callbacks, amount/receipt matching, status-query reconciliation, and end-of-period cancellation scheduling.
- PostgreSQL-backed distributed fixed-window rate limits with keyed HMAC client-address digests and production fail-closed behaviour.
- Agency console, fictional read-only property demo, PostgreSQL-backed validated image uploads, and service discovery endpoint.
- Encrypted PostgreSQL logical-backup and guarded restore scripts with CI integration tests against disposable PostgreSQL 16 databases.

### Security and operations
- Moved schema changes to an explicit migration command; application startup no longer runs schema DDL.
- Added schema v5 readiness checks and restricted runtime database-role validation.
- Expanded security, architecture, API, production-readiness, and PostgreSQL operations documentation.
- Expanded CI to Node.js 22, 24, and 26 with dependency audits and PostgreSQL 16 operations checks.

### Not yet production-approved
- Email verification, password reset/account recovery, per-session revocation, and account abuse workflows.
- Automated invitation email delivery.
- Daraja sandbox/production provider acceptance, refunds, and Till/Buy Goods support.
- Independent off-host backup/restore evidence, production infrastructure, monitoring, penetration testing, and customer acceptance.

## 1.1.0 — 2026-10-26
- Added PostgreSQL-backed users/properties schema, constraints, foreign keys and indexes with development-only in-memory fallback.
- Added account registration/login, scrypt password hashing, expiring HMAC bearer tokens, authenticated listing creation, and owner/admin authorization for updates/deletes.
- Expanded tests for authentication, weak passwords, duplicate accounts, ownership boundaries, and CRUD.
- Updated CI to test Node.js 22/24 with PostgreSQL 16; documented setup and production gates.
