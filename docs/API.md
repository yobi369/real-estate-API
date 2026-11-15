# API contract

Base path: `/api/v1`. Public listing reads and customer enquiry submissions are available without an account. Listing writes require a bearer token. The enquiry inbox is restricted to admin users.

## Register and login
- `POST /api/v1/auth/register` with `{"email":"seller@example.com","password":"StrongPassword123"}`. Passwords require at least 12 characters with lowercase, uppercase, and a number.
- `POST /api/v1/auth/login` with email and password. Returns a short-lived bearer token.

## Public listing search
`GET /api/v1/properties?page=1&limit=20&category=property&city=Nairobi&propertyType=apartment&transactionType=sale&minPrice=1000000&maxPrice=20000000&search=riverside`

Supported categories are `property`, `airbnb`, and `land`. Category is distinct from property type: a short-stay apartment uses category `airbnb`, property type `apartment`, transaction type `rent`, and price type `night`.

## Create and manage listings
`POST /api/v1/properties` with bearer token and JSON:
```json
{"title":"Coastal family home","description":"Bright home near amenities.","category":"property","price":12500000,"priceType":"total","currency":"KES","propertyType":"house","transactionType":"sale","bedrooms":3,"bathrooms":2,"city":"Mombasa","location":"Nyali","address":"Nyali, Mombasa, Kenya","country":"Kenya","areaSqm":180,"sizeAcres":0,"featured":false,"imageUrls":[]}
```
Owner identity is derived from the verified token. `GET /api/v1/properties/{id}` reads a listing. `PATCH` and `DELETE` require the owner or an admin.

## Customer enquiries
`POST /api/v1/inquiries` stores contact messages, property viewing requests, short-stay booking requests, and land site-visit requests. It accepts requestType (`general`, `booking`, `viewing`, or `site_visit`), name, email, phone, message, and optional service/listing/date/guest/pickup details. A success response is returned only after the repository has stored the enquiry.
`GET /api/v1/inquiries` returns the latest 100 enquiries and requires an admin bearer token. Standard registered users receive 403. Public registration cannot assign roles; agency operators must be promoted through a controlled database administration procedure.

## Health and documentation
- `GET /health/live`
- `GET /health/ready` — returns 200 only when PostgreSQL is configured and reachable.
- `GET /openapi.json`
- `GET /docs/`

Production requires PostgreSQL, a unique `JWT_SECRET`, and a `CORS_ORIGIN` allowlist containing the website origin.
