# Deployment runbook

## Local development
1. Install Node.js 22+ and PostgreSQL 16+.
2. Copy `.env.example` to `.env`; set `DATABASE_URL` to a local database.
3. Replace `JWT_SECRET` with a random secret (`openssl rand -base64 48`).
4. Run `npm install`, then `npm run dev`. Startup applies idempotent schema migrations.
5. Check `/health/live`, `/health/ready`, and `/docs/`.

## CI
GitHub Actions runs Node.js 22 and 24 against a PostgreSQL 16 service, then executes typecheck, test, build, and lint through `npm run verify`.

## Production checklist
- [ ] PostgreSQL managed service, TLS, least-privilege role, connection secret.
- [ ] Unique JWT secret stored in secret manager.
- [ ] Database backups, retention policy, restore drill.
- [ ] Rate limiting, monitoring, alerting, request timeout and incident process.
- [ ] CI green; dependency/secret scan reviewed.
- [ ] Admin role provisioning audited.
- [ ] Security and load testing completed.
