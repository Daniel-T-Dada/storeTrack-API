

const express = require("express");
const mongoose = require("mongoose");
const swaggerJsdoc = require("swagger-jsdoc");
const swaggerUi = require("swagger-ui-express");

// Import routes
const authRoutes = require("../routes/auth");
const productRoutes = require("../routes/products");
const staffRoutes = require("../routes/staff");
const salesRoutes = require("../routes/sales");
const reportsRoutes = require("../routes/reports");

const app = express();
app.use(express.json());

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log("MongoDB connected"))
.catch(err => console.error("MongoDB connection error:", err));

// All API routes mounted **relative to the root**
app.use("/auth", authRoutes);
app.use("/products", productRoutes);
app.use("/staff", staffRoutes);
app.use("/sales", salesRoutes);
app.use("/reports", reportsRoutes);
// Serve Swagger docs at /api/docs
app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(swaggerDocs));

// Swagger setup
const swaggerOptions = {
  swaggerDefinition: {
    openapi: "3.0.0",
    info: {
      title: "StoreTrack API",
      version: "1.0.0",
      description: "API documentation for StoreTrack",
    },
    servers: [
      {
        url: "/api", // <-- Important! Prefix all routes with /api for Vercel deployment
      },
    ],
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
  apis: ["./routes/*.js"], // keep pointing to your routes folder
};

const swaggerDocs = swaggerJsdoc(swaggerOptions);
app.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerDocs));

// 404 handler
app.use((req, res) => {
  res.status(404).json({ message: "Route not found" });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: "Something went wrong!", error: err.message });
});

// Export app for Vercel
module.exports = app;