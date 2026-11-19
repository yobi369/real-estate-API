# Testing and quality gates

Run `npm install` and `npm run verify`. This chains TypeScript checks, Vitest API tests, build, and ESLint.

Regression coverage includes health/docs, registration/login, password policy, duplicate email, invalid bearer tokens, unauthorized writes, agency context, cross-agency property and enquiry isolation, publication visibility/audit, validation, filtering, pagination, browser security headers, authentication throttling, and oversized JSON handling.

GitHub Actions runs Node.js 22 and 24 with PostgreSQL 16 and audits production dependencies before `npm run verify`. Check the actual workflow conclusion for the current commit; workflow configuration alone is not proof of a pass.

For HTTP performance, use `npm run benchmark` against a running target. See [BENCHMARKING.md](BENCHMARKING.md). The benchmark is opt-in and not part of deterministic CI because latency depends on the environment. Record raw results and system configuration; do not claim production capacity from a local smoke test.

Remaining release tests include invitation lifecycle, full audit coverage, migration rollback/restore, distributed rate limiting, token revocation, coverage thresholds, independent security review, and representative staging load tests.
