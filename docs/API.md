# API contract

Base path: `/api/v1`. Public listing reads and customer enquiry submissions are available without an account. Listing publication requires an administrator bearer token. The enquiry inbox is restricted to admin users.

## Register and login
- `POST /api/v1/auth/register` with `{"email":"seller@example.com","password":"StrongPassword123"}`. Passwords require at least 12 characters with lowercase, uppercase, and a number.
- `POST /api/v1/auth/login` with email and password. Returns a short-lived bearer token.

## Public listing search
`GET /api/v1/properties?page=1&limit=20&category=property&city=Nairobi&propertyType=apartment&transactionType=sale&minPrice=1000000&maxPrice=20000000&search=riverside`

Supported categories are `property`, `airbnb`, and `land`. Category is distinct from property type: a short-stay apartment uses category `airbnb`, property type `apartment`, transaction type `rent`, and price type `night`.

## Create and manage listings
`POST /api/v1/properties` with an administrator bearer token and JSON. Ordinary registered users receive 403:
```json
{"title":"Coastal family home","description":"Bright home near amenities.","category":"property","price":12500000,"priceType":"total","currency":"KES","propertyType":"house","transactionType":"sale","bedrooms":3,"bathrooms":2,"city":"Mombasa","location":"Nyali","address":"Nyali, Mombasa, Kenya","country":"Kenya","areaSqm":180,"sizeAcres":0,"featured":false,"imageUrls":[]}
```
Owner identity is derived from the verified token. `GET /api/v1/properties/{id}` reads a listing. `PATCH` and `DELETE` require the owner or an admin.

## Customer enquiries
`POST /api/v1/inquiries` stores contact messages, property viewing requests, short-stay booking requests, and land site-visit requests. It accepts requestType (`general`, `booking`, `viewing`, or `site_visit`), name, email, phone, message, and optional service/listing/date/guest/pickup details. A success response is returned only after the repository has stored the enquiry.
`POST /api/v1/inquiries` is rate-limited to 10 submissions per client IP per 15 minutes per API process. Authentication bootstrap is limited to 5 requests per 15 minutes, registration and login to 10 each per 15 minutes, and public property/demo searches to 120 per minute. These limits are process-local; use a shared limiter or edge/WAF enforcement for multi-instance deployments. `GET /api/v1/inquiries` returns the latest 100 enquiries and requires an admin bearer token. Standard registered users receive 403.

## First administrator setup
Set a temporary `ADMIN_BOOTSTRAP_TOKEN` (at least 32 characters) in the API host's secret environment. Call `POST /api/v1/admin/bootstrap` with the `x-bootstrap-token` header and the chosen administrator email/password. The endpoint is disabled without the secret and returns 409 after an administrator exists. Remove the bootstrap token from the host after creating the first administrator.

## Health and documentation
- `GET /health/live`
- `GET /health/ready` — returns 200 only when PostgreSQL is configured and reachable.
- `GET /openapi.json`
- `GET /docs/`

Production requires PostgreSQL, a unique `JWT_SECRET`, and a `CORS_ORIGIN` allowlist containing the website origin. The bootstrap token is only needed for initial administrator creation and should then be removed.

## Performance testing

Use `npm run benchmark` against a running local or staging API. Configure `API_BASE_URL`, `BENCHMARK_PATH`, `BENCHMARK_REQUESTS`, and `BENCHMARK_CONCURRENCY`; optional error-rate and p95 thresholds are documented in [BENCHMARKING.md](BENCHMARKING.md). Benchmark output is environment-specific and is not a production capacity guarantee.


## Agency invitations
All invitation routes require a bearer token and an `X-Agency-ID` header where an agency context is required.

- `POST /api/v1/agencies/invitations` — agency owner/admin creates an invitation using `{"email":"agent@example.com","role":"agent"}`. Allowed roles are `admin`, `agent`, and `viewer`; owner cannot be granted by invitation. The response contains the opaque token once. Deliver it through a trusted channel; automated email delivery is not configured.
- `POST /api/v1/agencies/invitations/accept` — an authenticated user accepts using `{"token":"..."}`. The signed-in account email must match the invitation email. Tokens are stored as SHA-256 hashes, expire after seven days, and cannot be reused after acceptance or revocation.
- `DELETE /api/v1/agencies/invitations/{id}` — agency owner/admin revokes a pending invitation.

Invitation creation, acceptance, and revocation write audit events in the same transaction as the state change. An existing active membership cannot be overwritten by accepting an invitation.


## Agency membership administration

All routes below require a bearer token and a valid `X-Agency-ID`. The selected agency is verified against the caller's active membership.

- `GET /api/v1/agencies/members` — owner/admin only; lists active, invited, and suspended membership records for the selected agency, including member email, role, status, and join date.
- `PATCH /api/v1/agencies/members/{userId}` with `{"role":"agent"}` — changes a non-owner member role. Allowed roles are `admin`, `agent`, and `viewer`. Owners may assign any non-owner role; admins may only manage agent/viewer members and cannot grant admin privileges.
- `DELETE /api/v1/agencies/members/{userId}` — suspends an active non-owner membership. Owners may remove any non-owner member; admins may remove only agents/viewers. Self-removal is blocked.

The owner role is immutable through member-management endpoints. Ownership transfer is a two-step, recipient-accepted workflow: POST /api/v1/agencies/ownership-transfer (current owner only, with X-Agency-ID and a targetUserId UUID) creates a 48-hour transfer token; deliver it to the designated administrator through a trusted channel. POST /api/v1/agencies/ownership-transfer/accept requires that designated admin's authenticated account and the token. On acceptance, the recipient becomes owner and the previous owner becomes admin in one transaction. Only one pending transfer exists per agency; a new request supersedes the previous pending request. Tokens are stored as SHA-256 hashes and cannot be reused. Transfer creation and acceptance are audited transactionally. The owner cannot be removed through member-management routes. Cross-agency member access is denied.
