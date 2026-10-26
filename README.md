# Real Estate API

A documented TypeScript/Express REST API for property discovery and listing management.

## Current engineering capabilities
- Property create/read/search/update/delete endpoints with validation, bounded pagination, filtering, and consistent errors.
- PostgreSQL persistence with foreign-key/field constraints and indexes when `DATABASE_URL` is set; in-memory fallback is development/test only.
- Email/password registration and login, scrypt password hashing, expiring HMAC-signed bearer tokens, authenticated listing writes, and owner/admin authorization for modifications.
- Health/readiness checks, OpenAPI/Swagger, GitHub Actions CI on Node 22/24 with PostgreSQL 16, and documented production gates.

## Quick start
```bash
cp .env.example .env
# Configure DATABASE_URL and replace JWT_SECRET with a random secret
npm install
npm run dev
```
The application initializes the database schema at startup. For production, PostgreSQL and a unique JWT secret are mandatory. Without a database, readiness returns 503 and only the ephemeral development adapter is available.

## Verify
```bash
npm run verify
```

## Docs
- [Architecture](docs/ARCHITECTURE.md)
- [API contract](docs/API.md)
- [Security model](docs/SECURITY.md)
- [Testing](docs/TESTING.md)
- [Deployment](docs/DEPLOYMENT.md)
- [Changelog](CHANGELOG.md)
