
const express = require("express");
const dotenv = require("dotenv");
const mongoose = require("mongoose");
const swaggerJsdoc = require("swagger-jsdoc");
const swaggerUi = require("swagger-ui-express");

dotenv.config();
const app = express();

// Middleware
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

connectDB().catch(err => console. error("MongoDB connection error:", err));

// Routes
app.use("/api/auth", require("./routes/auth"));
app.use("/api/products", require("./routes/products"));
app.use("/api/staff", require("./routes/staff"));
app.use("/api/sales", require("./routes/sales"));
app.use("/api/reports", require("./routes/reports"));

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
      sales:  "/api/sales",
      reports: "/api/reports",
      documentation: "/api-docs"
    }
  });
});

// 404 handler
app. use((req, res) => {
  res.status(404).json({ message: "Route not found" });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error(err. stack);
  res.status(500).json({ message: "Something went wrong!", error: err.message });
});

// Export for Vercel serverless
module.exports = app;

// Start server for local development
if (require.main === module) {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}
