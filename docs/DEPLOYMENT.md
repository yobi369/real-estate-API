# Deployment runbook

## Local development

1. Install Node.js 22+ and PostgreSQL 16+.
2. Copy `.env.example` to `.env`; configure `DATABASE_URL`.
3. Replace `JWT_SECRET` with a unique random secret (for example, `openssl rand -base64 48`).
4. Run `npm install`, then `npm run dev`. Startup applies idempotent schema initialization.
5. Check `/health/live`, `/health/ready`, and `/docs/`.

## CI

GitHub Actions audits production dependencies and runs typecheck, tests, build, and lint on Node.js 22 and 24 against PostgreSQL 16.

## Benchmarking

Run the API in a staging environment and use `npm run benchmark`. Configure the target with `API_BASE_URL`, `BENCHMARK_PATH`, `BENCHMARK_REQUESTS`, and `BENCHMARK_CONCURRENCY`. Retain JSON output and environment details. See [BENCHMARKING.md](BENCHMARKING.md).

## Production checklist

- [ ] Managed PostgreSQL, TLS, least-privilege role, secret storage.
- [ ] Unique JWT secret; remove the bootstrap token after initial administrator creation.
- [ ] Backups, retention policy, and verified restore drill.
- [ ] Shared rate limiting/edge controls, monitoring, alerting, timeouts, and incident process.
- [ ] CI green for the exact release commit; dependency/secret scans reviewed.
- [ ] Audit coverage and invitation workflows complete or explicitly risk-accepted.
- [ ] Security review, representative load testing, and post-deploy smoke tests completed.
