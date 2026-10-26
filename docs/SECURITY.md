# Security model and production gates

## Implemented
- Helmet security headers, bounded JSON body (1 MiB), strict Zod input validation, configurable CORS, request IDs, and redacted authorization/cookie logs.
- Registration enforces a 12-character password plus upper/lowercase and numeric characters; passwords are salted and derived with Node.js scrypt, never stored in plaintext.
- HMAC-SHA256 signed bearer tokens have bounded expiry and signature verification using timing-safe comparison.
- Listing creation requires authentication. Listing update/delete requires ownership; an `admin` role may be granted only through trusted database administration, never public registration.
- Parameterized PostgreSQL queries, foreign keys, constraints, and indexes.

## Still required before public launch
- Configure production PostgreSQL, TLS/SSL connectivity, least-privilege DB user, backup and restore drills.
- Add rate limiting, account lockout/abuse controls, password reset and email verification, token revocation/rotation strategy, audit events, monitoring, alerting, and request timeouts.
- Admin role is not self-service; provision only through a secure, audited operator process. Review authorization and data access policy.
- Complete dependency/secret scans, penetration test, load test, privacy/retention review, and deployment-specific smoke tests.
- JWT secret must be unique, random, and managed in a secret store. Never commit production secrets.

## Honest readiness
Production startup fails without `DATABASE_URL` and a non-default `JWT_SECRET`. Without a database URL, development uses an ephemeral adapter and readiness returns 503; this mode is for local development/tests only.
