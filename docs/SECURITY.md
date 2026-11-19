# Security model and production gates

## Implemented controls

- Helmet security headers, disabled Express fingerprint, configured CORS, strict Zod validation, 1 MiB JSON body limit, request IDs, and redacted authorization/cookie/bootstrap-token logs.
- Registration enforces a 12-character password with uppercase, lowercase, and numeric characters. Passwords are salted and derived with Node.js scrypt.
- HMAC-SHA256 bearer tokens have bounded expiry and signature verification uses timing-safe comparison.
- First-admin bootstrap is secret-protected and one-time; production requires PostgreSQL and a non-default JWT secret.
- Authenticated agency operations resolve the selected agency against active membership. Property and enquiry repository operations are tenant-scoped; public listing reads expose published listings only.
- Publication transitions and agency creation/bootstrap write audit events transactionally.
- Parameterized PostgreSQL queries, foreign keys, constraints, and indexes.
- Process-local rate limits: bootstrap 5 requests/15 minutes per IP; registration 10/15 minutes; login 10/15 minutes; public property/demo search 120/minute; enquiries 10/15 minutes. Authentication/search/enquiry limits are per process and are not a distributed abuse-control system.
- HTTP benchmark runner is available through `npm run benchmark`; performance claims require recorded staging evidence.

## Known gaps before public launch

- Replace process-local rate limits with a shared store or enforce equivalent edge/WAF controls before horizontal scaling. Review proxy trust configuration for the actual hosting topology.
- Add email verification, secure password reset, account lockout/abuse workflows, and token revocation/rotation/session lifecycle.
- Extend audit coverage to property create/update/delete, membership changes, invitations, and administrative actions.
- Implement invitation create/accept/revoke workflows with single-use token verification and expiry enforcement.
- Configure production PostgreSQL TLS, least-privilege database role, backups, retention, and restore drills.
- Complete dependency/secret/static-analysis review, independent authorization review, penetration testing, and representative load testing.
- Add monitoring, alerting, request timeouts, incident ownership, privacy/retention review, and deployment-specific smoke tests.

## Honest readiness

The code and CI are not a substitute for production infrastructure and independent security assurance. Production startup fails without `DATABASE_URL` and a unique `JWT_SECRET`. Without PostgreSQL, readiness returns 503 and the in-memory adapter is for development/tests only. Do not load customer or personal data until the applicable release checklist is signed off.
