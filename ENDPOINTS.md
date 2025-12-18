# StoreTrack API Endpoints

Base URL (prod): `https://store-track-api.vercel.app`

## Notes

- Most endpoints require `Authorization: Bearer <accessToken>`.
- In `server.js`, routes are mounted under both `/api/*` and `/*` (root) as a fallback. Prefer the `/api/*` paths.
- Visiting a URL in the browser address bar always sends a `GET` request and cannot include required headers/body. Use `fetch()`, Postman, or `rest.http` for `POST/PUT/DELETE` and authenticated calls.
- CORS is controlled by `CORS_ORIGINS` (comma-separated). Example: `CORS_ORIGINS=http://localhost:3000,https://your-frontend.vercel.app`

## Docs

- Swagger UI: `GET /api-docs/` (also `GET /api/api-docs/`)
- OpenAPI JSON: `GET /api-docs/swagger.json` (also `GET /api/api-docs/swagger.json`)

## Auth

### Register

- **POST** `/api/auth/register`
- Auth: No
- Body (JSON)
  ```json
  {
  ```

### Forgot password

- **POST** `/api/auth/forgot-password`
- Auth: No
- Body (JSON)
  ```json
  { "email": "online@example.com" }
  ```
- Response: always returns a generic message; in this implementation it also returns `resetToken` + `resetPath` (for frontend integration/testing).

### Reset password

- **POST** `/api/auth/reset-password/:token`
- Auth: No
- Body (JSON)
  ```json
  { "password": "newStrongPassword" }
  ```
  "name": "Test",
  "email": "online@example.com",
  "password": "secure1234",
  "store": "507f1f77bcf86cd799439011"
  }
  ```

  ```

### Login

- **POST** `/api/auth/login`
- Auth: No
- Body (JSON)
  ```json
  {
    "email": "online@example.com",
    "password": "secure1234"
  }
  ```
- Response: `{ user, tokens: { accessToken, refreshToken } }`

### Refresh

- **POST** `/api/auth/refresh`
- Auth: No
- Body (JSON)
  ```json
  { "refreshToken": "<refreshToken>" }
  ```

## Products (Auth required)

### Create product

- **POST** `/api/products`
- Headers: `Authorization: Bearer <accessToken>`
- Body (JSON)
  ```json
  {
    "name": "Milk",
    "price": 500,
    "costPrice": 350,
    "quantity": 10,
    "lowStockThreshold": 5,
    "description": "Fresh milk"
  }
  ```

### List products

- **GET** `/api/products`
- Headers: `Authorization: Bearer <accessToken>`

### Update product

- **PUT** `/api/products/:id`
- Headers: `Authorization: Bearer <accessToken>`
- Body (JSON): partial updates allowed

### Delete product

- **DELETE** `/api/products/:id`
- Headers: `Authorization: Bearer <accessToken>`

## Staff (Auth required)

### Create staff

- **POST** `/api/staff`
- Headers: `Authorization: Bearer <accessToken>`
- Body (JSON)
  ```json
  { "name": "Jane", "role": "cashier" }
  ```

### List staff

- **GET** `/api/staff`
- Headers: `Authorization: Bearer <accessToken>`

### Delete staff

- **DELETE** `/api/staff/:id`
- Headers: `Authorization: Bearer <accessToken>`

## Sales (Auth required)

### Record sale

- **POST** `/api/sales`
- Headers: `Authorization: Bearer <accessToken>`
- Body (JSON)
  ```json
  {
    "product": "<productId>",
    "staff": "<staffId>",
    "quantity": 2,
    "totalPrice": 1000
  }
  ```

### List sales

- **GET** `/api/sales`
- Headers: `Authorization: Bearer <accessToken>`

## Reports (Auth required)

- **GET** `/api/reports/total-sales`
- **GET** `/api/reports/sales-by-staff` (optional query params: `startDate`, `endDate`)
- **GET** `/api/reports/low-stock`
- **GET** `/api/reports/profit`
- **GET** `/api/reports/profit-by-product`
- **GET** `/api/reports/profit-by-staff`
