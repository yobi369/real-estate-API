# Deployment runbook

## Local development

1. Install Node.js 22+ and PostgreSQL 16+.
2. Copy `.env.example` to `.env`; configure `DATABASE_URL`.
3. Replace `JWT_SECRET` with a unique random secret (for example, `openssl rand -base64 48`).
4. Run `npm install`, then `npm run db:migrate` to initialize/update the schema.
5. Start the API with `npm run dev` and check `/health/live`, `/health/ready`, and `/docs/`.

The server no longer performs schema DDL at startup. In production, `DATABASE_URL` is the least-privilege runtime role; `MIGRATION_DATABASE_URL` is a separate privileged credential supplied only to the one-off migration job.

## CI

GitHub Actions audits production dependencies and runs typecheck, tests, build, and lint on Node.js 22 and 24 against PostgreSQL 16.

## PostgreSQL backup and restore

Use the [PostgreSQL operations runbook](POSTGRES-OPERATIONS.md) and its encrypted backup/guarded restore scripts. A restore drill must use a disposable empty database or isolated branch, never the production database. Record the checksum, source/target identifiers, elapsed time, row-count checks, and application smoke-test evidence. Do not mark the production backup gate complete until an off-host encrypted copy and a successful restore have both been verified.

## Benchmarking

Run the API in a staging environment and use `npm run benchmark`. Configure the target with `API_BASE_URL`, `BENCHMARK_PATH`, `BENCHMARK_REQUESTS`, and `BENCHMARK_CONCURRENCY`. Retain JSON output and environment details. See [BENCHMARKING.md](BENCHMARKING.md).

## Production checklist

- [ ] Managed PostgreSQL, TLS, least-privilege runtime role, secret storage.
- [ ] Explicit, reviewed schema migration job; application startup must not need DDL privileges.
- [ ] Unique JWT secret; remove the bootstrap token after initial administrator creation.
- [ ] Provider backup retention plus independent encrypted off-host backup and verified restore drill.
- [ ] Shared rate limiting/edge controls, monitoring, alerting, timeouts, and incident process.
- [ ] CI green for the exact release commit; dependency/secret scans reviewed.
- [ ] Audit coverage and invitation workflows complete or explicitly risk-accepted.
- [ ] Security review, representative load testing, and post-deploy smoke tests completed.
