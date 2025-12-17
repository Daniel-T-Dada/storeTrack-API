// routes/reports.js
const express = require("express");
const router = express.Router();
const { authMiddleware } = require("../middleware/auth");

// Import all report controller methods
const {
  getSalesByStaff,
  getTotalSales,
  getLowStock,
  getProfit,
  getProfitByProduct,
  getProfitByStaff,
} = require("../controllers/reportsController");

/**
 * @swagger
 * tags:
 *   name: Reports
 *   description: Sales, profit & analytics reports
 */

// Routes using controller methods
router.get("/sales-by-staff", authMiddleware, getSalesByStaff);
router.get("/total-sales", authMiddleware, getTotalSales);
router.get("/low-stock", authMiddleware, getLowStock);
router.get("/profit", authMiddleware, getProfit);
router.get("/profit-by-product", authMiddleware, getProfitByProduct);
router.get("/profit-by-staff", authMiddleware, getProfitByStaff);

module.exports = router;