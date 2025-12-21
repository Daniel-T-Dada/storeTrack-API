# StoreTrack API Endpoints

Base URL (prod): `https://store-track-api.vercel.app`

## Notes

- Routes are mounted under both `/api/*` and `/*` (root) as a fallback. Prefer `/api/*`.
- Protected endpoints accept either:
  - Bearer token: `Authorization: Bearer <accessToken>`
  - Cookie auth: HttpOnly `accessToken` cookie
- For cookie auth from a browser, your frontend must send credentials:
  - `fetch(..., { credentials: "include" })`
  - or `axios` with `withCredentials: true`
- CORS is controlled by `CORS_ORIGINS` (comma-separated). Example:
  - `CORS_ORIGINS=http://localhost:3000,https://your-frontend.vercel.app`

## Docs

- Swagger UI: `GET /api-docs/` (also `GET /api/api-docs/`)
- OpenAPI JSON: `GET /api-docs/swagger.json` (also `GET /api/api-docs/swagger.json`)

## Error format (POS-friendly)

Validation errors follow this shape:

```json
{
  "message": "Validation error",
  "errors": [{ "msg": "...", "path": "field" }]
}
```

Server errors typically return:

```json
{ "message": "Server error" }
```

## RBAC Policy (one-page)

Legend: ✅ allowed, ❌ not allowed, 🔒 scope limited.

| Capability                                   |         Admin |       Manager |                      Staff |
| -------------------------------------------- | ------------: | ------------: | -------------------------: |
| Login as store owner                         |            ✅ |            ✅ |                         ❌ |
| Login as staff                               | ✅ (optional) | ✅ (optional) |                         ✅ |
| Refresh session (cookie/body refresh token)  |            ✅ |            ✅ |                         ✅ |
| Logout (cookie clear + revoke refresh token) |            ✅ |            ✅ |                         ✅ |
| Create product                               |            ✅ |            ✅ |                         ❌ |
| Update product                               |            ✅ |            ✅ |                         ❌ |
| Delete product                               |            ✅ |            ✅ |                         ❌ |
| List products                                |            ✅ |            ✅ |                         ✅ |
| Search products / lookup by SKU/barcode      |            ✅ |            ✅ |                         ✅ |
| Create staff                                 |            ✅ |            ✅ |                         ❌ |
| List staff                                   |            ✅ |            ✅ |                         ❌ |
| Delete staff                                 |            ✅ |            ❌ |                         ❌ |
| Record a sale                                |            ✅ |            ✅ |      ✅ (auto-assign self) |
| Checkout (multi-item)                        |            ✅ |            ✅ |      ✅ (auto-assign self) |
| View sales history                           |            ✅ |            ✅ |        🔒 (only own sales) |
| View transaction history                     |            ✅ |            ✅ | 🔒 (only own transactions) |
| View reports                                 |            ✅ |            ✅ |                         ❌ |

## Auth (Store owner)

### Register

- **POST** `/api/auth/register`
- Auth: No
- Body (JSON)

```json
{
  "name": "Test",
  "email": "online@example.com",
  "password": "secure1234",
  "store": "Zintra"
}
```

Response:

- Sets cookies: `accessToken`, `refreshToken`
- Returns `{ user, tokens: { accessToken, refreshToken } }`

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

Response:

- Sets cookies: `accessToken`, `refreshToken`
- Returns `{ user, tokens: { accessToken, refreshToken } }`

### Refresh

- **POST** `/api/auth/refresh`
- Auth: No
- Body (JSON) (optional if using cookie)

```json
{ "refreshToken": "<refreshToken>" }
```

Response:

- Rotates tokens, re-sets cookies
- Returns `{ tokens: { accessToken, refreshToken } }`

### Me

- **GET** `/api/auth/me`
- Auth: Yes (bearer or cookie)

Returns (for admin/manager/staff):

- `profileImage`: optional string (URL or data URI)

### Update profile (optional)

- **PATCH** `/api/auth/me`
- Auth: Yes (bearer or cookie)
- Body (JSON) (all fields optional)

```json
{ "profileImage": "https://..." }
```

To clear:

```json
{ "profileImage": null }
```

### Upload profile image (binary, recommended)

- **POST** `/api/auth/me/profile-image`
- Auth: Yes (bearer or cookie)
- Content-Type: `multipart/form-data`
- Form field: `file` (image)

Notes:

- Stores the image in Cloudinary and saves the resulting URL into `profileImage`.
- Requires env vars: `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`.

### Upload profile image (direct-to-cloud, recommended for web)

Use this flow to upload **directly from the frontend to Cloudinary** (avoids API buffering/memory limits) and then persist the uploaded asset on the authenticated account.

**Step 1 — Get signed upload params**

- **POST** `/api/uploads/cloudinary-signature`
- Auth: Yes (bearer or cookie)

Response:

```json
{
  "cloudName": "...",
  "apiKey": "...",
  "timestamp": 1730000000,
  "signature": "...",
  "folder": "storetrack/profile-images",
  "publicId": "user_65fae1c9d4..."
}
```

**Step 2 — Upload to Cloudinary (from the browser)**

- **POST** `https://api.cloudinary.com/v1_1/<cloudName>/image/upload`
- Content-Type: `multipart/form-data`

Form fields:

- `file` (binary)
- `api_key`, `timestamp`, `signature`, `folder`, `public_id`

Use the Cloudinary response fields `secure_url` and `public_id`.

**Step 3 — Persist the uploaded image on your account**

- **PUT** `/api/auth/me/profile-image`
- Auth: Yes (bearer or cookie)
- Body (JSON)

```json
{ "profileImagePublicId": "storetrack/profile-images/user_65fae1c9d4..." }
```

Notes:

- The API verifies the Cloudinary asset and saves `profileImage` and `profileImagePublicId`.
- `profileImagePublicId` must match the authenticated account (deterministic public id).

### Remove profile image

- **DELETE** `/api/auth/me/profile-image`
- Auth: Yes (bearer or cookie)

## StaffAuth (Staff sessions)

### Login

- **POST** `/api/staff-auth/login`
- Auth: No
- Body (JSON)

```json
{
  "email": "staff@example.com",
  "password": "password123"
}
```

Response:

- Sets cookies: `accessToken`, `staffRefreshToken`
- Returns `{ staff, tokens: { accessToken, refreshToken } }`

### Refresh

- **POST** `/api/staff-auth/refresh`
- Auth: No
- Body (JSON) (optional if using cookie)

```json
{ "refreshToken": "<staffRefreshToken>" }
```

Response:

- Rotates tokens, re-sets cookies
- Returns `{ tokens: { accessToken, refreshToken } }`

### Logout

- **POST** `/api/staff-auth/logout`
- Auth: No
- Body (JSON) optional

```json
{ "refreshToken": "<staffRefreshToken>" }
```

Response:

- Clears cookies: `accessToken`, `staffRefreshToken`
- Returns `{ message: "Logged out" }`

## Products (Auth required)

### Create product (admin/manager)

- **POST** `/api/products`
- Auth: Yes
- Body (JSON)

```json
{
  "name": "Milk",
  "sku": "SKU-MILK",
  "barcode": "1234567890123",
  "price": 500,
  "costPrice": 350,
  "quantity": 10,
  "lowStockThreshold": 5,
  "description": "Fresh milk"
}
```

### List products (admin/manager/staff)

- **GET** `/api/products`
- Auth: Yes

### Search products (admin/manager/staff)

- **GET** `/api/products/search?q=<query>&limit=20`
- Auth: Yes
- Matches on: `name`, `sku`, `barcode`

### Lookup product by SKU or barcode (admin/manager/staff)

- **GET** `/api/products/lookup?sku=SKU-MILK`
- **GET** `/api/products/lookup?barcode=1234567890123`
- Auth: Yes

### Update product (admin/manager)

- **PUT** `/api/products/:id`
- Auth: Yes
- Body (JSON): partial updates allowed

### Delete product (admin/manager)

- **DELETE** `/api/products/:id`
- Auth: Yes

## Staff (Auth required)

### Create staff (admin/manager)

- **POST** `/api/staff`
- Auth: Yes
- Body (JSON)

```json
{
  "name": "Cashier",
  "email": "cashier@example.com",
  "password": "password123",
  "role": "staff"
}
```

### List staff (admin/manager)

- **GET** `/api/staff`
- Auth: Yes

### Delete staff (admin only)

- **DELETE** `/api/staff/:id`
- Auth: Yes

## Sales (Auth required)

### Record sale (admin/manager/staff)

- **POST** `/api/sales`
- Auth: Yes
- Body (JSON)

```json
{
  "product": "<productId>",
  "quantity": 2,
  "staff": "<staffId>"
}
```

Notes:

- `totalPrice` is computed server-side.
- If logged in as `staff`, `staff` is auto-assigned (any provided value is ignored).
- If logged in as `admin/manager`, `staff` is required.

### Checkout (multi-item, atomic)

- **POST** `/api/sales/checkout`
- Auth: Yes
- Body (JSON)

```json
{
  "items": [
    { "product": "<productId>", "quantity": 2 },
    { "product": "<productId>", "quantity": 1 }
  ],
  "staff": "<staffId>",
  "client": { "expectedTotal": 1300 }
}
```

Notes:

- Duplicate product lines are merged server-side.
- `client.expectedTotal` is optional; server returns whether totals match.

### List sales (scalable)

- **GET** `/api/sales`
- Auth: Yes
- Response shape: `{ data, meta }`
- Query params:
  - `startDate`, `endDate` (ISO date-time)
  - `sort` (e.g. `-createdAt`)
  - `page`, `limit`
  - `cursor` (createdAt paging)
  - `staff` (admin/manager only)

## Transactions (Auth required)

### List transaction summaries

- **GET** `/api/sales/transactions`
- Auth: Yes
- Response shape: `{ data, meta }`
- Query params:
  - `startDate`, `endDate`
  - `page`, `limit`
  - `staff` (admin/manager only)

### Transaction details (summary + line items)

- **GET** `/api/sales/transactions/:transactionId`
- Auth: Yes

### Receipt payload (POS-friendly flattened view)

- **GET** `/api/sales/transactions/:transactionId/receipt`
- Auth: Yes

## Reports (Auth required; admin/manager only)

- **GET** `/api/reports/total-sales`
- **GET** `/api/reports/sales-by-staff` (optional query params: `startDate`, `endDate`)
- **GET** `/api/reports/low-stock`
- **GET** `/api/reports/profit`
- **GET** `/api/reports/profit-by-product`
- **GET** `/api/reports/profit-by-staff`
