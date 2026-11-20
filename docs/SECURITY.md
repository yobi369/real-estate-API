# Security model and production gates

## Implemented controls

- Helmet security headers, disabled Express fingerprint, configured CORS, strict Zod validation, 1 MiB JSON body limit, request IDs, and redacted authorization/cookie/bootstrap-token logs.
- Registration enforces a 12-character password with uppercase, lowercase, and numeric characters. Passwords are salted and derived with Node.js scrypt.
- HMAC-SHA256 bearer tokens have bounded expiry and signature verification uses timing-safe comparison.
- First-admin bootstrap is secret-protected and one-time; production requires PostgreSQL and a non-default JWT secret.
- Authenticated agency operations resolve the selected agency against active membership. Property and enquiry repository operations are tenant-scoped; public listing reads expose published listings only.
- Publication transitions and agency creation/bootstrap write audit events transactionally.
- Parameterized PostgreSQL queries, foreign keys, constraints, and indexes.
- PostgreSQL-backed fixed-window rate limits shared across application replicas: bootstrap 5 requests/15 minutes; registration 10/15 minutes; login 10/15 minutes; M-Pesa checkout 5/15 minutes; public property/demo search 120/minute; enquiries 10/15 minutes. Client IPs are stored as keyed HMAC-SHA256 digests, not raw addresses. Production fails closed with HTTP 503 if the shared store is unavailable; process-local fallback is limited to development/test.
- HTTP benchmark runner is available through `npm run benchmark`; performance claims require recorded staging evidence.

## Known gaps before public launch

- Tune shared rate-limit thresholds and monitor PostgreSQL load in staging; retain edge/WAF protection for volumetric attacks. Review proxy trust configuration for the actual hosting topology.
- Add email verification, secure password reset, account lockout/abuse workflows, and token revocation/rotation/session lifecycle.
- Extend audit coverage to payment reconciliation and remaining administrative actions; agency, membership, invitation, ownership-transfer, listing, and subscription-cancellation mutations are audited transactionally.
- Invitation create/accept/revoke workflows are implemented with hashed single-use tokens, email matching, seven-day expiry, and transactional audit events. Automated invitation email delivery, resend, and expiry notifications remain outstanding.
- Configure production PostgreSQL TLS, least-privilege database role, backups, retention, and restore drills.
- Complete dependency/secret/static-analysis review, independent authorization review, penetration testing, and representative load testing.
- Add monitoring, alerting, request timeouts, incident ownership, privacy/retention review, and deployment-specific smoke tests.

## Honest readiness

The code and CI are not a substitute for production infrastructure and independent security assurance. Production startup fails without `DATABASE_URL` and a unique `JWT_SECRET`. Without PostgreSQL, readiness returns 503 and the in-memory adapter is for development/tests only. Do not load customer or personal data until the applicable release checklist is signed off.
