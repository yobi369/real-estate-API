# API contract

Base path: `/api/v1`. Listing reads are public; writes require `Authorization: Bearer <token>`.

## Register
`POST /api/v1/auth/register` with `{"email":"seller@example.com","password":"StrongPassword123"}`. Passwords require at least 12 characters with lowercase, uppercase, and a number. Returns 201 and a bearer token. Duplicate email returns 409.

## Login
`POST /api/v1/auth/login` with email and password. Returns a short-lived bearer token; invalid credentials return the same generic 401 response.

## Create listing
`POST /api/v1/properties` with bearer token and JSON:
```json
{"title":"Coastal family home","description":"Bright home near amenities.","price":12500000,"currency":"KES","propertyType":"house","transactionType":"sale","bedrooms":3,"bathrooms":2,"city":"Mombasa","country":"Kenya","imageUrls":[]}
```
Owner identity is derived from the verified token, never from request input.

## Search
`GET /api/v1/properties?page=1&limit=20&city=Mombasa&propertyType=house&minPrice=1000000&maxPrice=20000000&search=coastal`. Page defaults to 1, limit to 20 and max 100. Search supports city, type, transaction, price range, and text.

## Read/update/delete
- `GET /api/v1/properties/{id}` — public read.
- `PATCH /api/v1/properties/{id}` — authenticated owner or admin; currently expects a complete validated property object.
- `DELETE /api/v1/properties/{id}` — authenticated owner or admin.

## Health/docs
`GET /health/live`, `/health/ready`, `/openapi.json`, `/docs/`.
