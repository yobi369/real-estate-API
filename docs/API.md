# API contract

Base path: `/api/v1`. All examples use fictional property data.

## Create listing
`POST /api/v1/properties` with JSON:
```json
{"title":"Coastal family home","description":"Bright home near amenities.","price":12500000,"currency":"KES","propertyType":"house","transactionType":"sale","bedrooms":3,"bathrooms":2,"city":"Mombasa","country":"Kenya","imageUrls":[]}
```
Returns 201, a `Location` header, and `{ "data": { ... } }`.

## Search
`GET /api/v1/properties?page=1&limit=20&city=Mombasa&propertyType=house&minPrice=1000000&maxPrice=20000000&search=coastal`
`page` defaults to 1; `limit` defaults to 20 and is capped at 100. Filters include city, property type, transaction type, price range, and text search. `minPrice` cannot exceed `maxPrice`.

## Single listing
`GET /api/v1/properties/{id}` returns 404 when absent.

## Health/docs
`GET /health/live`, `/health/ready`, `/openapi.json`, `/docs/`.

## Error envelope
```json
{"error":{"code":"VALIDATION_ERROR","message":"Property payload is invalid","details":{}}}
```
Stack traces and internal exception details are not returned to API clients.
