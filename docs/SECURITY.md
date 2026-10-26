# Security model and production gates

## Implemented baseline
- Helmet security headers and disabled `X-Powered-By`.
- JSON request limit of 1 MiB.
- Strict Zod validation for listing payloads and bounded query parameters.
- Configurable CORS allowlist.
- Request IDs and redaction of authorization/cookie headers in HTTP logs.
- Generic internal-error response and no secrets in `.env.example`.

## Blocking gaps — do not expose publicly yet
1. Authentication and authorization are absent; listing creation is unauthenticated.
2. Storage is ephemeral in-memory data.
3. Rate limiting, ownership/tenant isolation, and audit trail are absent.
4. No dependency/security scan, penetration test, load test, backup/restore test, or production deployment has been verified.

## Required before launch
Implement OIDC/JWT verification and ownership-based authorization; PostgreSQL with migrations and least-privilege credentials; rate limits and request timeouts; exact production CORS; TLS; backup/restore drills; dependency and secret scans; monitoring/alerts; retention/privacy procedures; and independent security and load testing. Never trust a client-supplied user ID.
