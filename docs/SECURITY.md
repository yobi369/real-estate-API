# Security model and production gates

## Implemented controls

- Helmet security headers, disabled Express fingerprint, configured CORS, strict Zod validation, 1 MiB JSON body limit, request IDs, and structured logging with authorization, cookies, bootstrap headers, and request URLs redacted.
- Registration enforces a 12-character password with lowercase, uppercase, and numeric characters. Passwords are salted and derived with Node.js scrypt.
- HMAC-SHA256 bearer tokens have bounded expiry and signature verification uses timing-safe comparison. The default TTL is one hour.
- Each token is bound to a persisted `auth_sessions` record and a user. Every authenticated request verifies that the session remains active and loads the current user role from PostgreSQL; logout and account session management can revoke one session immediately.
- First-admin bootstrap is secret-protected and one-time; production requires PostgreSQL and a non-default JWT secret. The bootstrap secret must be removed after initial setup.
- Authenticated agency operations resolve the selected agency against the caller's active membership. Property, enquiry, invitation, membership, ownership-transfer, and billing operations enforce agency scope and role permissions.
- Public listing reads are restricted to published inventory and omit owner/agency identifiers.
- Parameterized PostgreSQL queries, foreign keys, constraints, indexes, and transactional audit events protect data integrity and privileged changes.
- Image uploads are administrator-only, limited to 5 MiB, checked against JPEG/PNG/WebP file signatures, and stored in PostgreSQL rather than ephemeral application disk.
- PostgreSQL-backed fixed-window rate limits are shared across replicas: bootstrap 5 requests/15 minutes; registration 10/15 minutes; login 10/15 minutes; M-Pesa checkout/reconciliation 5/15 minutes; public property/demo search 120/minute; enquiries 10/15 minutes. Client addresses are stored as keyed HMAC-SHA256 digests, not raw IP addresses. Production fails closed with HTTP 503 if the shared store is unavailable; process-local fallback is limited to development/test.
- Express trusts three proxy hops based on the observed Render staging chain. This setting must be revalidated if the service is moved or its proxy topology changes.
- Agency invitation tokens are hashed, email-bound, single-use, and expire after seven days. Ownership-transfer tokens are hashed, single-use, and expire after 48 hours.
- Daraja STK Push checkout uses idempotency keys. Subscription activation requires a verified callback or status-query result matching the pending payment, expected amount, and receipt. Callback path secrets are compared in constant time.
- Encrypted PostgreSQL logical-backup and guarded restore scripts are tested in CI against disposable PostgreSQL 16 databases. CI validates encryption, checksum, restore into an empty target, and refusal to overwrite populated targets.
- CI runs dependency audits, PostgreSQL operations-script validation, typecheck, tests, build, and lint on Node.js 22, 24, and 26.

## Known gaps before public launch

- Implement email verification, secure password reset, account recovery, session inventory, per-session revocation, and account abuse/lockout workflows. Rotating JWT_SECRET invalidates existing tokens globally but is not a substitute for per-session revocation.
- Complete an independent authorization review and penetration test, and review audit-event coverage for every privileged operation.
- Tune shared rate-limit thresholds using representative staging traffic and retain edge/WAF protection for volumetric attacks.
- Automated invitation email delivery, resend, expiry notifications, and verified sender/domain configuration are not implemented; invitation delivery is currently manual.
- Configure production PostgreSQL TLS, least-privilege runtime role, managed backups, retention, and an independent encrypted off-host logical backup. Complete an operator-run restore drill with application-level verification.
- Complete dependency, secret, static-analysis, and container/runtime review. Resolve material findings and record evidence.
- Add central monitoring, alerting, database-capacity monitoring, request timeouts, incident ownership, and incident-response procedures.
- Complete representative load testing and deployed smoke tests for critical user flows.
- Verify customer data governance, retention, deletion, export, access revocation, and Kenyan data-protection responsibilities before accepting personal data.
- Complete Daraja sandbox testing, production PayBill onboarding, callback delivery/retry tests, missing-callback reconciliation, duplicate callback tests, and customer cancellation/timeout tests. Refund handling and Till/Buy Goods support are not implemented.

## Credential handling

- Never commit database URLs, passwords, JWT secrets, bootstrap tokens, Daraja credentials, callback secrets, backup identities, or decrypted dumps.
- Use the hosting provider's secret store. Do not send credentials or bearer tokens through chat, tickets, logs, or source control.
- Treat any exposed credential or token as compromised and rotate/revoke it using the relevant provider or account workflow.
- Keep migration-owner credentials separate from the long-running runtime service.

## Honest readiness

The code and CI are not a substitute for production infrastructure and independent security assurance. Production startup fails without DATABASE_URL and a unique JWT_SECRET. Without PostgreSQL, readiness returns 503 and the in-memory adapter is for development/tests only. Do not load customer or personal data until all applicable release gates are signed off.
