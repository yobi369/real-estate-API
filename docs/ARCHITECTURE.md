# Architecture

## Request flow
1. Express applies security headers, CORS, bounded JSON parsing, and redacted structured logging.
2. Auth routes validate payloads; passwords are scrypt-derived and bearer tokens are HMAC-SHA256 signed with expiry.
3. Listing routes validate Zod contracts. Public read/search routes call the repository; create requires a principal; update/delete enforce owner or admin checks.
4. Repository uses parameterized PostgreSQL statements when `DATABASE_URL` is configured. Development/test fallback is in-memory and never considered ready for production.

## Modules
- `src/domain/property.ts`: property request/query schemas.
- `src/auth.ts`: registration, password verification, token issuance/validation, principal middleware.
- `src/db.ts`: PostgreSQL pool and idempotent schema initialization.
- `src/repositories/property-repository.ts`: PostgreSQL/in-memory adapters.
- `src/app.ts`: HTTP composition and route authorization.
- `src/config.ts`: fail-fast environment validation.
- `src/server.ts`: schema initialization and graceful shutdown.
- `tests/api.test.ts`: HTTP contract and authorization regressions.

## Data model
`users` has a unique normalized email and password hash. `properties.owner_id` references users with a foreign key. Database constraints validate currency, listing types, and positive price. Indexes support owner, city, and price access.

## Principles
Validate at boundaries, use parameterized SQL, minimize privileges, make ownership checks server-side, keep error envelopes stable, and do not overstate verification.
