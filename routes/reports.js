const express = require("express");
const router = express.Router();
const { authMiddleware } = require("../middleware/auth");

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

// Route: Get total sales grouped by staff
router.get("/sales-by-staff", authMiddleware, getSalesByStaff);

// Route: Get total sales amount
router.get("/total-sales", authMiddleware, getTotalSales);

// Route: Get products with low stock
router.get("/low-stock", authMiddleware, getLowStock);

// Route: Get total revenue, profit and margin
router.get("/profit", authMiddleware, getProfit);

// Route: Profit per product
router.get("/profit-by-product", authMiddleware, getProfitByProduct);

// Route: Profit per staff
router.get("/profit-by-staff", authMiddleware, getProfitByStaff);

module.exports = router;