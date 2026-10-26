# ADR 0001: Validated API foundation and persistence boundary

- Status: accepted for development foundation
- Date: 2026-10-26

## Context
The repository needs a maintainable baseline with explicit API contracts, repeatable tests, and visible production gates. Claiming database durability or identity security without implementing and verifying them would be misleading.

## Decision
Use TypeScript, Express, Zod, OpenAPI, and Vitest. Separate domain schemas from the repository adapter. Keep an in-memory adapter for deterministic contract development and clearly document it as a production blocker.

## Consequences
Local development is simple and API behavior can be tested without external services. Data is ephemeral; PostgreSQL, migrations, authentication, authorization, and operational controls are required before production.
