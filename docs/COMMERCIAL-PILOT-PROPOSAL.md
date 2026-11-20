# Property Inventory API — Integration Pilot Proposal

**Prepared by:** Brian Mutunga  
**Product:** Real Estate API  
**Repository:** https://github.com/yobi369/real-estate-API  
**Demonstration:** `/demo/` on the deployed API host

## The opportunity

Property businesses often publish listings through websites, portals and internal workflows. This API provides a structured property inventory interface that can be evaluated as an integration component alongside an organisation's existing systems.

It is not proposed as a forced replacement for an existing CRM, website or property-management platform.

## Proposed solution

A scoped integration pilot using the Real Estate API:

- A PostgreSQL-backed property record store.
- Public listing retrieval and search by city, property type, transaction type, price range and text.
- Authenticated listing creation and owner/admin modification controls.
- Documented REST endpoints and Swagger UI.
- Integration with one agreed website, internal dashboard or approved application workflow.

## Pilot scope and deliverables

**Indicative duration:** 10 working days after receipt of access, agreed requirements and the initial payment.

1. Requirements and data-field mapping workshop.
2. Configure a dedicated test/staging environment.
3. Connect one agreed property-listing workflow to the API.
4. Import or enter an agreed, limited set of client-authorised test records.
5. Validate search, listing retrieval and authorised listing updates.
6. Handover notes, API documentation walkthrough and one operator orientation session.

The pilot is limited to one integration, one agreed environment and the acceptance criteria signed off before work begins. Additional modules, bulk migration, mobile applications, payment processing, CRM replacement, custom reporting and third-party integrations require a separate scope and quotation.

## Indicative pilot price

<escape>KSh 45,000</escape> one-time professional services fee for the scope above.

- 50% commencement payment: <escape>KSh 22,500</escape>.
- 50% after agreed acceptance and handover: <escape>KSh 22,500</escape>.
- Cloud hosting, managed PostgreSQL, domain, email/SMS services, taxes where applicable and third-party licences are excluded and should be paid directly by the client.
- Any change to the agreed scope is quoted and approved before implementation.

This is an initial indicative offer, not a binding quotation. Final pricing depends on the client's existing technology, data quality, access requirements and acceptance criteria.

## Secure Properties SaaS subscription options

The agency workspace is planned as a separate recurring product. The initial monthly prices have been approved:

| Plan | Monthly price |
|---|---:|
| Starter | KSh 2,500 |
| Professional | KSh 5,000 |
| Business | KSh 12,000 |

These are subscription prices, not the one-time integration pilot fee above. Approved allowances are Starter: 25 active listings and 3 team seats; Professional: 100 active listings and 10 team seats; Business: 500 active listings and 30 team seats. Draft and published listings count; archived listings do not. Active members and pending invitations consume team seats. New listings and invitations require a current paid/trial subscription. API request quotas and paid API access are not included and will be offered separately after metering and developer-key controls are implemented. Support response times, taxes, onboarding, grace periods, and refund/cancellation terms must be agreed in the order form. Plans remain inactive until M-Pesa acceptance tests and operational release gates are complete.

## Security, data and ownership

- Client production data will not be placed in the public demonstration environment.
- Demo records are fictional and are not property offers.
- The client controls its data and production infrastructure.
- The developer retains ownership of the pre-existing API and grants a written licence for the agreed deployment and use.
- Access, backups, retention, support, incident handling and any data-processing obligations will be documented before production use.

## Acceptance criteria

The pilot is accepted when the agreed integration can retrieve the authorised test listings, apply the agreed search filters, enforce the agreed access controls, and pass the jointly agreed smoke tests in the client-approved environment.

## Next step

Arrange a 30-minute technical discovery discussion to confirm the current listing workflow, integration point, data fields and pilot acceptance criteria.

**Contact:** Brian Mutunga · https://brianmutunga.vercel.app
