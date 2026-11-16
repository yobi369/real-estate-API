# Secure Properties — Kenya-First Ecosystem Plan

**Status:** Proposed product and commercial direction  
**Owner:** Brian Mutunga  
**Products:** Secure Properties Marketplace, Secure Properties Business, Real Estate API  
**Initial market:** Kenya  
**Initial customer:** Real estate agencies  
**Operating constraint:** Validate demand using the existing low-cost infrastructure before adding paid services.

## 1. Positioning

Secure Properties is a Kenya-first property technology platform that helps property businesses publish and manage inventory, handle customer enquiries, and connect property information to digital channels and third-party applications.

The product is an ecosystem with three connected offerings:

1. **Marketplace:** property, land and short-stay discovery; public listings; enquiries; agency and agent profiles.
2. **Business:** agency workspaces, team membership, listing operations, lead management and reporting.
3. **API:** documented, authenticated integrations for websites, dashboards and approved third-party applications.

The platform must not claim that a property, title, agent or transaction is verified unless a documented review process and evidence support that exact claim.

## 2. Initial customer and problem

Start with small and mid-sized Kenyan real estate agencies. Validate whether they need a reliable way to maintain property inventory, publish listings, capture enquiries and manage follow-up without replacing every existing tool.

Initial sales motion:
- Identify 20 suitable agencies.
- Conduct 10 discovery conversations.
- Demonstrate the current working product to 5 agencies.
- Recruit 3 pilot agencies.
- Convert at least 2 pilots to paid use after agreeing scope and value.

These are validation targets, not forecast conversion rates.

## 3. Commercial hypotheses

Test the following indicative prices with prospective customers; do not present them as established market rates:

| Offer | Initial pricing hypothesis |
| --- | ---: |
| Public basic listings | Free |
| Featured listing | KSh 500 per listing / campaign |
| Starter agency | KSh 2,500 per month |
| Professional agency | KSh 5,000 per month |
| Enterprise/API integration | Quoted after discovery |

Do not implement payment collection until the product has agency-level ownership, permissions, usage measurement, clear plan limits, cancellation and support processes.

## 4. Current technical baseline

The existing frontend repository is `yobi369/Secure-Properties-` (private). It uses React 19 and Vite and currently contains:
- Public property, Airbnb/short-stay and land catalogue pages.
- KES/USD display.
- Property detail and viewing/booking request forms.
- A single agency administrator portal for listing and enquiry operations.
- API client calls for `/api/v1/properties`, `/api/v1/inquiries`, `/api/v1/admin/bootstrap`, `/api/v1/auth/login` and `/api/v1/media`.

The backend repository is `yobi369/real-estate-API`. It currently provides:
- TypeScript, Express 5 and PostgreSQL.
- Versioned property and enquiry endpoints.
- Password hashing, expiring bearer tokens, administrator bootstrap and owner/admin checks.
- Image storage in PostgreSQL.
- OpenAPI/Swagger, health/readiness endpoints and automated tests.

The current backend is an agency-administered inventory service, not a multi-tenant SaaS. Its current user roles are `user` and `admin`; it has no agency/workspace or membership model. The public frontend and admin portal must not be represented as a complete multi-agency product yet.

## 5. Target architecture

Introduce explicit agency tenancy before onboarding unrelated agencies.

Proposed core entities:
- `agencies`: legal/display name, slug, contact details, status and timestamps.
- `agency_memberships`: agency, user, role, invitation state and timestamps.
- `agency_invitations`: invited email, role, expiry, inviter and one-time token hash.
- `properties`: add a non-null `agency_id` for tenant ownership; retain an owner/user reference for audit.
- `inquiries`: associate each enquiry with its target agency and, when applicable, property.
- `audit_events`: actor, agency, action, resource, timestamp and safe metadata.
- `subscriptions` and `plan_entitlements`: add only after agency tenancy and usage tracking are reliable.

Suggested initial membership roles:
- `agency_owner`: manages agency settings, members and billing.
- `agency_admin`: manages inventory, enquiries and team operations.
- `agent`: manages assigned listings and permitted enquiries.
- `viewer`: read-only access to permitted agency data.
- `platform_admin`: tightly restricted platform operations role.

Tenant isolation must be enforced server-side on every read and write. Never trust a client-supplied agency ID as proof of access. Derive the active agency context from authenticated membership and validate it on each request. Add cross-tenant negative tests before migration or launch.

## 6. Delivery roadmap

### Phase 0 — Verify current baseline
- Confirm the deployed API's live and ready health checks.
- Verify production PostgreSQL connectivity and backup configuration.
- Run the backend verification suite against the current branch.
- Smoke-test public listings, enquiries, login, admin listing creation and media upload.
- Confirm the frontend production environment has the correct API base URL and allowed CORS origin.
- Record the current database schema and deployment configuration without exposing secrets.

### Phase 1 — Multi-agency foundation
- Design and review agency, membership and invitation schemas.
- Add additive PostgreSQL migrations and rollback/recovery notes.
- Create agency registration and invitation flows.
- Add server-derived tenant context and agency-scoped repository queries.
- Add role checks for listing and enquiry operations.
- Add audit events for sensitive operations.
- Add cross-tenant authorization and migration tests.
- Preserve the existing single-agency data under a deliberately created initial agency; do not silently orphan existing listings or enquiries.

### Phase 2 — Agency MVP
- Add agency onboarding and profile settings.
- Add team member invitation and role management.
- Add agency-scoped listing CRUD and image management.
- Associate enquiries with the correct agency and listing.
- Add lead statuses and follow-up notes.
- Add a basic operational dashboard.
- Add listing ownership/authorization evidence fields and moderation states without implying title verification.

### Phase 3 — Pilot and revenue validation
- Onboard 3 pilot agencies using authorised test or customer-approved records.
- Measure listing activation, enquiry volume, response time and weekly active agency users.
- Interview users after 2–4 weeks.
- Test the proposed Starter and Professional prices.
- Invoice manually at first if legally and operationally appropriate; automate billing only after willingness to pay is demonstrated.

### Phase 4 — API product
- Publish stable OpenAPI documentation and examples.
- Issue revocable, scoped API credentials to approved integrations.
- Add per-key rate limits, usage accounting and audit logs.
- Define API versioning, support boundaries and service-level expectations.
- Keep private agency/customer data inaccessible to public endpoints.

### Phase 5 — Expansion
- Improve analytics and operational reporting.
- Add M-Pesa payments only when there is a validated use case and a compliant payment-provider integration.
- Expand beyond Nairobi based on agency demand, with Mombasa as the next candidate market.
- Consider regional expansion only after the Kenyan operating model is repeatable.

## 7. Trust, privacy and compliance

- Distinguish agent credential checks, owner/agent authority to advertise, document review and independent title/legal verification.
- Do not imply that EARB registration proves ownership of a particular property.
- Collect only personal data needed for a defined service purpose.
- Define controller/processor roles, privacy notices, retention, deletion, access controls and incident handling before customer data is onboarded.
- Review Kenyan data-protection and applicable AML obligations with qualified advisers based on the actual business activities.
- Do not process deposits, rent, sale proceeds or client funds as part of the initial product.

## 8. Launch gates

Do not declare a multi-agency commercial launch until all of the following are evidenced:
- Tenant isolation tests pass for every agency-scoped route.
- Existing records are safely migrated and reconciled.
- Authentication, invitation expiry and role changes are tested.
- Production database backups and a restore drill are documented.
- Monitoring, error reporting and support ownership exist.
- Privacy and customer data terms are reviewed.
- Pilot agencies have approved the data they provide and the acceptance criteria.
- Public marketing accurately describes what is live, what is a pilot and what remains planned.

## 9. Success measures

Initial six-month validation targets:
- 10 agencies onboarded.
- 5 paying agencies.
- 100 active, agency-authorised listings.
- 100 qualified enquiries.
- KSh 25,000 monthly recurring revenue.
- Published API documentation and at least one approved external integration.

These are goals for learning and execution, not guarantees or claims of current traction.

## 10. Immediate next engineering task

Before changing production data or adding billing, produce a reviewed multi-tenant technical design and test plan. The first implementation PR should introduce agency and membership foundations with additive migrations and tests, while preserving the current single-agency workflow until a safe migration path is verified.
