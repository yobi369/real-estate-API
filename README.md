# Real Estate API

A documented TypeScript/Express REST API foundation for property listings. Priorities: explicit contracts, validation, automated tests, CI, and an honest production-readiness record.

> **Status:** development foundation. The current adapter stores records in memory; data resets on restart. Authentication, authorization, durable database storage, rate limiting, and production security review are not yet implemented. Do not expose publicly with real data until these gates are closed.

## Stack
Node.js 22+, TypeScript, Express 5, Zod, Helmet, Pino HTTP, OpenAPI, Vitest, Supertest.

## Quick start
```bash
cp .env.example .env
npm install
npm run dev
```

## Quality gates
```bash
npm run typecheck
npm test
npm run build
npm run lint
```

## Endpoints
- `GET /health/live` — process liveness.
- `GET /health/ready` — readiness and adapter status.
- `GET /api/v1/properties` — validated filters and bounded pagination.
- `GET /api/v1/properties/:id` — retrieve one listing.
- `POST /api/v1/properties` — create listing (currently unauthenticated; development only).
- `GET /openapi.json` and `/docs/` — API contract and Swagger UI.

## Docs
- [Architecture](docs/ARCHITECTURE.md)
- [API examples](docs/API.md)
- [Security and production gates](docs/SECURITY.md)
- [Testing](docs/TESTING.md)
- [Deployment runbook](docs/DEPLOYMENT.md)
- [Quality evidence and DataFactor target](docs/QUALITY-EVIDENCE.md)
- [Decision record](docs/decisions/0001-api-foundation.md)
- [Changelog](CHANGELOG.md)

## DataFactor goal
Target: **79/100**. This is a goal, not a guaranteed result. Record the actual external assessment and date in `docs/QUALITY-EVIDENCE.md`; never claim a score before it is reported.

MIT License — see [LICENSE](LICENSE).
