
const express = require("express");
const dotenv = require("dotenv");
const mongoose = require("mongoose");
const cors = require("cors");
const swaggerJsdoc = require("swagger-jsdoc");
const swaggerUi = require("swagger-ui-express");

dotenv.config();
const app = express();

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

app.use(express.json());

// Connect to MongoDB (serverless-friendly)
let conn = null;
async function connectDB() {
  if (conn == null) {
    conn = await mongoose.connect(process.env.MONGO_URI);
    console.log("MongoDB connected");
  }
  return conn;
}

connectDB().catch(err => console.error("MongoDB connection error:", err));

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
  app.use(joinBasePath(basePath, "/products"), require("./routes/products"));
  app.use(joinBasePath(basePath, "/staff"), require("./routes/staff"));
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
        },
      },
    },
    security: [{ bearerAuth: [] }],
  },
  apis: ["./routes/*.js"],
};

const swaggerDocs = swaggerJsdoc(swaggerOptions);

// Swagger UI uses relative asset URLs; ensure trailing slash so assets resolve under /api-docs/
const redirectToTrailingSlash = (req, res) => {
  const [pathname, queryString] = req.originalUrl.split("?");
  const target = `${pathname}/` + (queryString ? `?${queryString}` : "");
  res.redirect(301, target);
};

app.get(["/api-docs", "/api/api-docs"], redirectToTrailingSlash);

// Expose raw spec for debugging (useful on serverless/proxies)
app.get(["/api-docs/swagger.json", "/api/api-docs/swagger.json"], (req, res) => {
  res.json(swaggerDocs);
});

// Serve Swagger UI from common base paths
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerDocs));

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
  console.error(err.stack);
  res.status(500).json({ message: "Something went wrong!", error: err.message });
});

// Export for Vercel serverless
module.exports = app;

// Start server for local development
if (require.main === module) {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}
