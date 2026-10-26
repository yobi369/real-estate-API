# Testing and quality gates

Run `npm ci`, `npm run typecheck`, `npm test`, `npm run build`, and `npm run lint`; `npm run verify` chains these checks.

The current HTTP regression suite covers liveness, OpenAPI/Swagger availability, listing creation, invalid payload rejection, filtering and pagination, not-found responses, and inverted price ranges.

GitHub Actions runs type-checking, tests, compilation, and lint on Node.js 22 and 24 for the upgrade branch and pull requests to main. CI status must be checked in GitHub; this document alone does not assert that the workflow passed.

Every bug fix should add a regression test. Before release, add PostgreSQL integration and migration tests, authorization tests, coverage thresholds, dependency scanning, and load tests.
