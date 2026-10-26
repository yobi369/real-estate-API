# Changelog

## 1.1.0 — 2026-10-26
- Added PostgreSQL-backed users/properties schema, constraints, foreign keys and indexes with development-only in-memory fallback.
- Added account registration/login, scrypt password hashing, expiring HMAC bearer tokens, authenticated listing creation, and owner/admin authorization for updates/deletes.
- Expanded tests for authentication, weak passwords, duplicate accounts, ownership boundaries, and CRUD.
- Updated CI to test Node.js 22/24 with PostgreSQL 16; documented setup and production gates.
