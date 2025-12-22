
const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const swaggerJsdoc = require("swagger-jsdoc");
const swaggerUi = require("swagger-ui-express");
const path = require("path");
const connectDB = require("./config/db");
const { initCloudinary } = require("./config/cloudinary");

dotenv.config();
const app = express();

initCloudinary();

app.set("trust proxy", true);

// Middleware
const parseCorsOrigins = (value) => {
  if (!value) return [];
  return value
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);
};

const corsOrigins = parseCorsOrigins(process.env.CORS_ORIGINS);

// Helpful defaults for local dev (Swagger UI is served from this same server)
const devDefaultOrigins = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:5000",
  "http://127.0.0.1:5000",
];

const allowedOrigins = new Set(corsOrigins);
if (process.env.NODE_ENV !== "production") {
  for (const origin of devDefaultOrigins) allowedOrigins.add(origin);
}

const corsOptions = {
  origin: (origin, callback) => {
    // Allow non-browser requests (no Origin header) like Postman/REST Client
    if (!origin) return callback(null, true);

    // If not configured, default to allowing all origins (dev-friendly)
    if (corsOrigins.length === 0) return callback(null, true);

    // Allow configured origins (+ dev defaults)
    if (allowedOrigins.has(origin)) return callback(null, true);

    // Deny without throwing (prevents noisy stack traces)
    return callback(null, false);
  },
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true,
  optionsSuccessStatus: 204,
};

app.use(cors(corsOptions));

// Explicitly handle preflight (Express v5 doesn't accept "*" path here)
app.options(/.*/, cors(corsOptions));

// Cookies (needed for cookie-based auth)
app.use(cookieParser());

app.use(express.json());

// Ensure DB is connected before handling routes (serverless-friendly cached connection).
app.use(async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (err) {
    next(err);
  }
});

// Kick off initial connection (non-blocking) to surface config issues early.
connectDB().then(() => console.log("MongoDB connected")).catch(err => console.error("MongoDB connection error:", err));

// Routes
const joinBasePath = (basePath, subPath) => {
  const base = (basePath || "").trim();
  if (!base) return subPath;
  return `${base}${subPath}`;
};

const apiBasePaths = Array.from(
  new Set([
    process.env.API_BASE_PATH,
    "/api",
    "",
  ].map(v => (v ?? "").trim()))
).filter(Boolean);

// Always include empty base path (root) as a fallback.
if (!apiBasePaths.includes("")) apiBasePaths.push("");

for (const basePath of apiBasePaths) {
  app.use(joinBasePath(basePath, "/auth"), require("./routes/auth"));
  app.use(joinBasePath(basePath, "/uploads"), require("./routes/uploads"));
  app.use(joinBasePath(basePath, "/products"), require("./routes/products"));
  app.use(joinBasePath(basePath, "/staff"), require("./routes/staff"));
  app.use(joinBasePath(basePath, "/staff-auth"), require("./routes/staffAuth")); // Added staff auth route
  app.use(joinBasePath(basePath, "/sales"), require("./routes/sales"));
  app.use(joinBasePath(basePath, "/reports"), require("./routes/reports"));
}

// Swagger setup
const swaggerOptions = {
  swaggerDefinition: {
    openapi: "3.0.0",
    info: {
      title: "StoreTrack API",
      version: "1.0.0",
      description: "API documentation for StoreTrack",
    },
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
          description:
            "JWT access token. Protected endpoints also accept an HttpOnly 'accessToken' cookie (cookie-based auth).",
        },
        cookieAuth: {
          type: "apiKey",
          in: "cookie",
          name: "accessToken",
          description:
            "HttpOnly cookie-based auth. Sent automatically by the browser when using credentials (axios withCredentials / fetch credentials: include).",
        },
      },
      schemas: {
        TransactionSummary: {
          type: "object",
          properties: {
            id: { type: "string", example: "65fae1c9d4..." },
            createdAt: { type: "string", format: "date-time" },
            lastCreatedAt: { type: "string", format: "date-time" },
            staff: { type: "string", nullable: true, description: "Staff id (null when cashierType=user)" },
            staffName: {
              type: "string",
              nullable: true,
              description: "Display name of the cashier (staff name or user name snapshot)",
            },
            cashierType: {
              type: "string",
              enum: ["staff", "user"],
              description: "Who recorded the transaction",
              example: "user",
            },
            cashierUser: {
              type: "string",
              nullable: true,
              description: "User id when cashierType=user, else null",
            },
            cashierName: {
              type: "string",
              nullable: true,
              description: "Cashier name snapshot",
            },
            itemsCount: { type: "number", example: 2 },
            totalQuantity: { type: "number", example: 3 },
            total: { type: "number", example: 1300 },
          },
        },
        TransactionListResponse: {
          type: "object",
          properties: {
            data: {
              type: "array",
              items: { $ref: "#/components/schemas/TransactionSummary" },
            },
            meta: {
              type: "object",
              properties: {
                total: { type: "number" },
                limit: { type: "number" },
                page: { type: "number" },
              },
            },
          },
        },
        TransactionDetailsResponse: {
          type: "object",
          properties: {
            transaction: { $ref: "#/components/schemas/TransactionSummary" },
            sales: {
              type: "array",
              items: { $ref: "#/components/schemas/Sale" },
            },
          },
        },
        ReceiptLineItem: {
          type: "object",
          properties: {
            saleId: { type: "string" },
            productId: { type: "string" },
            name: { type: "string" },
            sku: { type: "string", nullable: true },
            barcode: { type: "string", nullable: true },
            unitPrice: { type: "number" },
            quantity: { type: "number" },
            total: { type: "number" },
          },
        },
        TransactionReceiptResponse: {
          type: "object",
          properties: {
            transaction: { $ref: "#/components/schemas/TransactionSummary" },
            items: {
              type: "array",
              items: { $ref: "#/components/schemas/ReceiptLineItem" },
            },
          },
        },
        User: {
          type: "object",
          properties: {
            _id: { type: "string", example: "65fae1c9d4..." },
            name: { type: "string", example: "Store Owner" },
            email: { type: "string", example: "owner@example.com" },
            role: { type: "string", enum: ["admin", "manager"], example: "admin" },
            isEmailVerified: { type: "boolean", example: true },
            profileImage: {
              type: "string",
              nullable: true,
              description: "Optional profile image URL or data URI",
            },
            store: { type: "string", nullable: true, example: "Zintra" },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
          },
        },
        Staff: {
          type: "object",
          properties: {
            _id: { type: "string", example: "65fae1c9d4..." },
            name: { type: "string", example: "Jane Doe" },
            email: { type: "string", example: "jane@example.com" },
            role: { type: "string", enum: ["admin", "manager", "staff"], example: "staff" },
            profileImage: {
              type: "string",
              nullable: true,
              description: "Optional profile image URL or data URI",
            },
            store: { type: "string", description: "Store owner (User) id" },
            createdAt: { type: "string", format: "date-time" },
          },
        },
        Product: {
          type: "object",
          properties: {
            _id: { type: "string", example: "65fae1c9d4..." },
            name: { type: "string", example: "Milk" },
            sku: { type: "string", nullable: true, example: "SKU-001" },
            barcode: { type: "string", nullable: true, example: "1234567890123" },
            price: { type: "number", example: 500 },
            costPrice: { type: "number", example: 350 },
            quantity: { type: "number", example: 10 },
            lowStockThreshold: { type: "number", example: 5 },
            isLowStock: { type: "boolean", example: false },
            description: { type: "string", nullable: true },
            store: { type: "string", description: "Store owner (User) id" },
            createdAt: { type: "string", format: "date-time" },
          },
        },
        Sale: {
          type: "object",
          properties: {
            _id: { type: "string", example: "65fae1c9d4..." },
            transactionId: { type: "string", nullable: true },
            product: { oneOf: [{ type: "string" }, { $ref: "#/components/schemas/Product" }] },
            productNameSnapshot: { type: "string", nullable: true },
            unitPrice: { type: "number", nullable: true },
            unitCostPrice: { type: "number", nullable: true },
            staff: {
              nullable: true,
              oneOf: [{ type: "string" }, { $ref: "#/components/schemas/Staff" }],
              description: "Staff ref (null when cashierType=user)",
            },
            cashierType: { type: "string", enum: ["staff", "user"], nullable: true },
            cashierUser: {
              nullable: true,
              oneOf: [{ type: "string" }, { $ref: "#/components/schemas/User" }],
              description: "User ref when cashierType=user",
            },
            cashierNameSnapshot: { type: "string", nullable: true },
            quantity: { type: "number", example: 2 },
            totalPrice: { type: "number", example: 1000 },
            store: { type: "string", description: "Store owner (User) id" },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
          },
        },
        Tokens: {
          type: "object",
          properties: {
            accessToken: { type: "string" },
            refreshToken: { type: "string" },
          },
        },
      },
    },
  },
  // Use absolute glob so swagger-jsdoc consistently finds route annotations
  // regardless of current working directory (Windows/Vercel/serverless).
  apis: [path.join(__dirname, "routes", "*.js").replace(/\\/g, "/")],
};

const swaggerDocs = swaggerJsdoc(swaggerOptions);

// Swagger UI uses relative asset URLs; ensure trailing slash so assets resolve under /api-docs/
const redirectToTrailingSlash = (req, res) => {
  const [pathname, queryString] = req.originalUrl.split("?");
  const target = `${pathname}/` + (queryString ? `?${queryString}` : "");
  res.redirect(301, target);
};

// Serve Swagger under all configured API base paths.
// This avoids "Swagger not showing" issues on platforms like Vercel when routes are accessed via
// different prefixes (e.g. /api/*, /*, or a custom API_BASE_PATH like /5000/*).
const docsBasePaths = Array.from(new Set(["", ...apiBasePaths]));

for (const basePath of docsBasePaths) {
  const docsPath = joinBasePath(basePath, "/api-docs");
  const specPath = joinBasePath(basePath, "/api-docs/swagger.json");

  app.get([docsPath], redirectToTrailingSlash);

  // Expose raw spec for debugging (useful on serverless/proxies)
  app.get([specPath], (req, res) => {
    res.set("Cache-Control", "no-store");
    res.json(swaggerDocs);
  });

  app.use(docsPath, swaggerUi.serve, swaggerUi.setup(swaggerDocs));
}

// Welcome route
app.get("/", (req, res) => {
  res.json({
    message: "Welcome to StoreTrack API",
    version: "1.0.0",
    note: "Most endpoints require an Authorization Bearer token. This server also mounts routes at the root (without /api) as a fallback; prefer the /api paths.",
    docs: {
      swaggerUi: ["/api-docs/"],
    },
    endpoints: [
      { method: "POST", path: "/api/auth/register", auth: false },
      { method: "POST", path: "/api/auth/register-send-otp", auth: false },
      { method: "POST", path: "/api/auth/verify-email", auth: false },
      { method: "POST", path: "/api/auth/verify-otp-login", auth: false },
      { method: "POST", path: "/api/auth/resend-verification", auth: false },
      { method: "POST", path: "/api/auth/login", auth: false },
      { method: "POST", path: "/api/auth/refresh", auth: false },
      { method: "POST", path: "/api/auth/forgot-password", auth: false },
      { method: "POST", path: "/api/auth/reset-password/:token", auth: false },

      { method: "POST", path: "/api/products", auth: true },
      { method: "GET", path: "/api/products", auth: true },
      { method: "PUT", path: "/api/products/:id", auth: true },
      { method: "DELETE", path: "/api/products/:id", auth: true },

      { method: "POST", path: "/api/staff", auth: true },
      { method: "GET", path: "/api/staff", auth: true },
      { method: "DELETE", path: "/api/staff/:id", auth: true },

      { method: "POST", path: "/api/sales", auth: true },
      { method: "GET", path: "/api/sales", auth: true },

      { method: "GET", path: "/api/reports/sales-by-staff", auth: true },
      { method: "GET", path: "/api/reports/total-sales", auth: true },
      { method: "GET", path: "/api/reports/low-stock", auth: true },
      { method: "GET", path: "/api/reports/profit", auth: true },
      { method: "GET", path: "/api/reports/profit-by-product", auth: true },
      { method: "GET", path: "/api/reports/profit-by-staff", auth: true },
    ],
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ message: "Route not found" });
});

// Global error handler
app.use((err, req, res, next) => {
  const isProd = process.env.NODE_ENV === "production";
  const status = Number(err?.status || err?.statusCode || 500);

  // Handle malformed JSON bodies
  if (err instanceof SyntaxError && "body" in err) {
    return res.status(400).json({
      message: "Validation error",
      errors: [{ msg: "Invalid JSON body", path: "body" }],
    });
  }

  const message = status >= 500 ? "Server error" : (err.message || "Request error");

  if (!isProd) {
    console.error(err);
  }

  res.status(status).json({
    message,
    code: err?.code,
    details: err?.details,
  });
});

// Export for Vercel serverless
module.exports = app;

// Start server for local development
if (require.main === module) {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}
