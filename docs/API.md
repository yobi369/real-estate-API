# API contract

Base path: /api/v1. JSON responses use a data envelope for successful resource responses and a consistent error envelope for failures. Public listing reads and customer enquiry submissions are unauthenticated. Agency operations require a bearer token and, where indicated, an X-Agency-ID header. X-Agency-ID selects an agency context; active membership is always checked server-side.

## Authentication

- POST /api/v1/auth/register — create an account using email and password. Passwords require at least 12 characters with lowercase, uppercase, and a number. Returns a short-lived bearer token.
- POST /api/v1/auth/login — authenticate with email and password. Returns a short-lived bearer token; default expiry is one hour. Each login creates a separately revocable server-side session.
- POST /api/v1/auth/password-reset/request — request a one-time password reset email. Returns the same 202 response whether or not the email exists. Requires the email provider settings.\n- POST /api/v1/auth/password-reset/complete — submit a reset token and new password. The 30-minute token is single-use; successful reset revokes all active sessions.\n- GET /api/v1/auth/sessions — list the account's active sessions and identify the current session.
- DELETE /api/v1/auth/sessions/{sessionId} — revoke one active session belonging to the authenticated account. Other accounts' sessions cannot be revoked.
- POST /api/v1/auth/logout — revoke the current bearer session immediately.
- POST /api/v1/admin/bootstrap — one-time first administrator and default agency creation. Requires the x-bootstrap-token header and a temporary ADMIN_BOOTSTRAP_TOKEN configured in the environment. Remove the environment secret immediately after successful bootstrap. Returns 409 once an administrator exists.

Email verification and refresh tokens are not implemented yet. Password reset requires EMAIL_API_URL, EMAIL_API_KEY, EMAIL_FROM, and PUBLIC_APP_URL configured together. The email transport uses a documented provider-neutral JSON request contract; adapt the provider endpoint to that contract. Access tokens are stored as server-side sessions and can be individually revoked; revocation is checked on every authenticated request. Rotating JWT_SECRET invalidates all existing tokens globally.

## Agency workspace and team

- POST /api/v1/agencies — authenticated account creates an agency and becomes its owner.
- GET /api/v1/agencies/me — list the authenticated user's active agency memberships.
- GET /api/v1/agencies/members — owner/admin; list active, invited, and suspended membership records for the selected agency.
- PATCH /api/v1/agencies/members/{userId} — owner/admin; change a non-owner member role to admin, agent, or viewer. Admins may only manage agent/viewer memberships and cannot grant admin.
- DELETE /api/v1/agencies/members/{userId} — owner/admin; suspend a non-owner member. Self-removal and owner removal are blocked.
- POST /api/v1/agencies/invitations — owner/admin; create an email-bound invitation for admin, agent, or viewer. Requires an active subscription and available team seat. The opaque token is returned once and must be delivered through a trusted channel; delivery is currently manual.
- POST /api/v1/agencies/invitations/accept — authenticated matching-email account accepts the token. Tokens are hashed, expire after seven days, and cannot be reused.
- DELETE /api/v1/agencies/invitations/{id} — owner/admin; revoke a pending invitation.
- POST /api/v1/agencies/ownership-transfer — current owner nominates an active admin using targetUserId. Returns a one-time token for trusted delivery; expires after 48 hours.
- POST /api/v1/agencies/ownership-transfer/accept — only the designated recipient can accept. On success the recipient becomes owner and the previous owner becomes admin.

Role boundaries: owners have full agency control; admins can manage listings, billing, and agent/viewer memberships; agents can create listings and modify/delete their own listings; viewers have read-only agency access. Only owners/admins can publish listings or view the agency enquiry inbox.

## Property inventory

- GET /api/v1/properties — public paginated search of published listings. Supports page, limit, category, city, propertyType, transactionType, minPrice, maxPrice, and search filters.
- GET /api/v1/properties/{id} — public read of a published listing.
- GET /api/v1/agencies/properties — authenticated, agency-scoped private inventory, including drafts and archived listings. Supports the standard property query filters.
- POST /api/v1/properties — owner/admin/agent creates a draft listing. Requires bearer token and X-Agency-ID. A current paid/trial subscription and available listing allowance are required.
- PATCH /api/v1/properties/{id} — owner/admin can modify any listing in the agency; agents can modify their own.
- DELETE /api/v1/properties/{id} — owner/admin can delete any listing in the agency; agents can delete their own.
- PATCH /api/v1/properties/{id}/publication — owner/admin only; set draft, published, or archived. Public reads expose published listings only.

Supported categories: property, airbnb, land. Supported property types: apartment, house, land, commercial. Supported transaction types: sale, rent, lease. Currency values: KES, USD, GBP.

## Media

- POST /api/v1/media — administrator-only raw image upload. Content-Type must match a valid JPEG, PNG, or WebP file signature. Maximum file size is 5 MiB. Persistent PostgreSQL storage is required.
- GET /api/v1/media/{id} — retrieve a stored image by UUID. Responses use immutable caching and nosniff headers.

## Customer enquiries

- POST /api/v1/inquiries — public enquiry submission for general, booking, viewing, or site-visit requests. Listing-linked enquiries derive their agency from the listing. General enquiries may use an active agencySlug.
- GET /api/v1/inquiries — owner/admin only for the selected agency; returns up to 100 recent enquiries.

A success response is returned only after the enquiry has been persisted.

## Subscription and M-Pesa billing

- GET /api/v1/billing/plans — list active plans only. The seeded plans are inactive until an authorised operator activates them after commercial and payment acceptance gates are met.
- GET /api/v1/billing/subscription — owner/admin; returns the selected agency's current subscription and recent payment history.
- POST /api/v1/billing/mpesa/stk-push — owner/admin; requires X-Agency-ID, an Idempotency-Key (16–128 characters), planCode, and phoneNumber. Starts a Daraja PayBill STK Push. A pending attempt is held when the provider outcome is unknown to avoid duplicate charges.
- POST /api/v1/webhooks/mpesa/{secret} — unauthenticated Safaricom callback endpoint protected by a configured high-entropy callback path secret. Callback payloads are matched to the pending checkout and expected amount before activation.
- POST /api/v1/billing/payments/{paymentId}/reconcile — owner/admin; queries Daraja status for a pending payment when a callback is delayed or missing.
- POST /api/v1/billing/subscription/cancel — owner/admin; schedules cancellation at the end of the current paid period.

The adapter currently supports customer-to-business PayBill STK Push. Till/Buy Goods, refunds, API-key monetization, and usage metering are not implemented. Configure all MPESA_* settings together in the secret store; do not expose them in source control or chat. Daraja sandbox credentials and end-to-end provider verification remain outstanding.

Initial monthly plan pricing and allowances:
- Starter: KSh 2,500; 25 listings; 3 team seats.
- Professional: KSh 5,000; 100 listings; 10 team seats.
- Business: KSh 12,000; 500 listings; 30 team seats.

Plans are seeded inactive. Creating listings and inviting team members requires a current paid/trial subscription. Draft and published listings count; archived listings do not. Active members and unexpired pending invitations consume team seats. Expiry/grace-period policy remains a release decision.

## Health and documentation

- GET / — service discovery metadata.
- GET /health/live — process liveness.
- GET /health/ready — returns 200 only when PostgreSQL is reachable and schema version 7 plus all required tables are present; otherwise returns 503.
- GET /openapi.json — OpenAPI 3.1 contract.
- GET /docs/ — Swagger UI.

## Rate limits

Limits are shared across replicas using PostgreSQL fixed-window counters. Production fails closed with HTTP 503 if the shared store is unavailable. Client addresses are stored as keyed HMAC-SHA256 digests rather than raw IP addresses.

- Bootstrap: 5 requests per 15 minutes.
- Registration: 10 requests per 15 minutes.
- Login: 10 requests per 15 minutes.
- M-Pesa checkout and reconciliation: 5 requests per 15 minutes.
- Public property/demo search: 120 requests per minute.
- Public enquiries: 10 requests per 15 minutes.

## Performance testing

Use npm run benchmark against a running local or staging API. Configure API_BASE_URL, BENCHMARK_PATH, BENCHMARK_REQUESTS, and BENCHMARK_CONCURRENCY. Benchmark output is environment-specific and is not a production capacity guarantee.
