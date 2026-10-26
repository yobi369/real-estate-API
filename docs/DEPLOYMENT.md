# Deployment runbook

## Local
1. Install Node.js 22+.
2. Copy `.env.example` to `.env`.
3. Run `npm install` and `npm run dev`.
4. Check `/health/live`, `/health/ready`, and `/docs/`.

## Production gates
- [ ] PostgreSQL repository and versioned migrations.
- [ ] Authentication, authorization, ownership enforcement.
- [ ] Secrets stored in deployment secret manager.
- [ ] Exact CORS origins, rate limiting, TLS.
- [ ] Liveness/readiness validated by target platform.
- [ ] Backup and restore drill completed.
- [ ] CI green on supported Node versions.
- [ ] Dependency/secret scans reviewed.
- [ ] Monitoring, alerts, rollback plan.
- [ ] Security and load tests completed.

Do not deploy the current in-memory, unauthenticated implementation with real user or property-owner data.
