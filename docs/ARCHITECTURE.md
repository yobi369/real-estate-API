# Architecture

## Request flow
1. Express applies security headers, CORS policy, bounded JSON parsing, and request logging.
2. Zod validates input at the HTTP boundary.
3. Route handlers use a repository adapter and return stable `data` or `error` envelopes.
4. OpenAPI and Swagger UI expose the documented contract.

## Modules
- `src/domain/property.ts`: input and query schemas.
- `src/repositories/property-repository.ts`: development-only persistence adapter.
- `src/app.ts`: middleware, routes, OpenAPI, error envelopes.
- `src/config.ts`: fail-fast environment parsing.
- `src/server.ts`: process lifecycle.
- `tests/api.test.ts`: HTTP contract regressions.

## Explicit limitation
The current adapter is in-memory: data is ephemeral, not shared across instances, and not safe for real production listings. Implement PostgreSQL and migrations before production. The adapter seam is intended to keep HTTP contracts independent of storage implementation.

## Principles
Validate at boundaries, bound inputs, keep errors stable, avoid leaking internal exceptions, and document incomplete controls honestly.
