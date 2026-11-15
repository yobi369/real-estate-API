# Security model and production gates

## Implemented
- Helmet security headers, bounded JSON body (1 MiB), strict Zod input validation, configurable CORS, request IDs, and redacted authorization, cookie and bootstrap-token logs.
- Registration enforces a 12-character password plus upper/lowercase and numeric characters; passwords are salted and derived with Node.js scrypt, never stored in plaintext.
- HMAC-SHA256 signed bearer tokens have bounded expiry and signature verification using timing-safe comparison.
- Only administrators can publish listings. Listing update/delete requires ownership or admin privileges. Public registration cannot assign roles; the first administrator is created through a one-time secret-protected bootstrap endpoint.
- Parameterized PostgreSQL queries, foreign keys, constraints, and indexes.

- Public enquiry submissions are rate-limited to 10 per client IP per 15 minutes per process. This is a single-instance safeguard; use a shared limiter or edge/WAF control before scaling horizontally.

## Still required before public launch
- Configure production PostgreSQL, TLS/SSL connectivity, least-privilege DB user, backup and restore drills.
- Add rate limiting for authentication and public search, account lockout/abuse controls, password reset and email verification, token revocation/rotation strategy, audit events, monitoring, alerting, and request timeouts.
- Create the first admin using a temporary bootstrap secret, then remove the secret from the host. Review authorization and data access policy.
- Complete dependency/secret scans, penetration test, load test, privacy/retention review, and deployment-specific smoke tests.
- JWT secret must be unique, random, and managed in a secret store. Never commit production secrets.

## Honest readiness
Production startup fails without `DATABASE_URL` and a non-default `JWT_SECRET`. Without a database URL, development uses an ephemeral adapter and readiness returns 503; this mode is for local development/tests only.
