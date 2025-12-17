
const express = require("express");
const mongoose = require("mongoose");
const swaggerJsdoc = require("swagger-jsdoc");
const swaggerUi = require("swagger-ui-express");
const path = require("path");
require("dotenv").config();

const app = express();
app.use(express.json());

// Only connect to Mongo once, prevent multiple connections in serverless
let conn = null;
async function connectDB() {
  if (conn == null) {
    conn = await mongoose.connect(process.env. MONGO_URI);
    console.log("MongoDB connected");
  }
  return conn;
}

// Connect to DB
connectDB().catch(err => console.error("MongoDB connection error:", err));

// Routes - Use path.join for proper resolution
app.use("/api/auth", require(path.join(__dirname, "../routes/auth")));
app.use("/api/products", require(path.join(__dirname, "../routes/products")));
app.use("/api/staff", require(path.join(__dirname, "../routes/staff")));
app.use("/api/sales", require(path.join(__dirname, "../routes/sales")));
app.use("/api/reports", require(path.join(__dirname, "../routes/reports")));

// Swagger setup
const swaggerOptions = {
  swaggerDefinition: {
    openapi: "3.0.0",
    info: { title: "StoreTrack API", version: "1.0.0", description: "API docs" },
    components: { securitySchemes: { bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" } } },
    security: [{ bearerAuth: [] }],
  },
  apis: [path.join(__dirname, "../routes/*.js")],
};
const swaggerDocs = swaggerJsdoc(swaggerOptions);
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerDocs));

// Welcome route
app.get("/", (req, res) => {
  res.json({
    message: "Welcome to StoreTrack API",
    version: "1.0.0",
    endpoints: {
      authentication: "/api/auth",
      products: "/api/products",
      staff: "/api/staff",
      sales: "/api/sales",
      reports: "/api/reports",
      documentation: "/api-docs"
    }
  });
});

// 404 handler
app.use((req, res) => res.status(404).json({ message: "Route not found" }));

// Serverless handler
module.exports = app;
