# Testing and quality gates

Run `npm install` and `npm run verify`. This chains TypeScript checks, Vitest API tests, build, and ESLint.

Regression tests cover health/docs, account registration/login, password policy, duplicate email, missing/invalid bearer token, unauthenticated writes, owner update/delete, cross-user authorization denial, listing validation, filtering, and pagination.

GitHub Actions runs Node.js 22 and 24 with a PostgreSQL 16 service. CI results must be checked in GitHub; configuration alone is not proof of a passing run. Add migration, concurrency, rate-limit, revocation, dependency audit, coverage thresholds, and load/security tests before release.
