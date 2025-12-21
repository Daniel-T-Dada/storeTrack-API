// routes/reports.js
const express = require("express");
const router = express.Router();
const { authMiddleware } = require("../middleware/auth");
const roleMiddleware = require("../middleware/roleMiddleware");

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

/**
 * @swagger
 * /api/reports/sales-by-staff:
 *   get:
 *     summary: Total sales grouped by staff
 *     tags: [Reports]
 *     description: Admin/manager only. Optionally filter by date range.
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Optional start date (inclusive)
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Optional end date (inclusive)
 *     responses:
 *       200:
 *         description: Report rows
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   staffId:
 *                     type: string
 *                   staffName:
 *                     type: string
 *                   totalSales:
 *                     type: number
 *                   totalQuantity:
 *                     type: number
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 */

/**
 * @swagger
 * /api/reports/total-sales:
 *   get:
 *     summary: Total sales summary
 *     tags: [Reports]
 *     description: Admin/manager only.
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Totals
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 totalSales:
 *                   type: number
 *                 totalRevenue:
 *                   type: number
 *                 totalTransactions:
 *                   type: number
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 */

/**
 * @swagger
 * /api/reports/low-stock:
 *   get:
 *     summary: List low-stock products
 *     tags: [Reports]
 *     description: Admin/manager only.
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Products
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Product'
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 */

/**
 * @swagger
 * /api/reports/profit:
 *   get:
 *     summary: Revenue, cost, profit, and margin
 *     tags: [Reports]
 *     description: Admin/manager only.
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Profit summary
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 revenue:
 *                   type: number
 *                 cost:
 *                   type: number
 *                 profit:
 *                   type: number
 *                 margin:
 *                   type: string
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 */

/**
 * @swagger
 * /api/reports/profit-by-product:
 *   get:
 *     summary: Profit grouped by product
 *     tags: [Reports]
 *     description: Admin/manager only.
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Report rows
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   productId:
 *                     type: string
 *                   productName:
 *                     type: string
 *                   revenue:
 *                     type: number
 *                   profit:
 *                     type: number
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 */

/**
 * @swagger
 * /api/reports/profit-by-staff:
 *   get:
 *     summary: Profit grouped by staff
 *     tags: [Reports]
 *     description: Admin/manager only.
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Report rows
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   staffId:
 *                     type: string
 *                   staffName:
 *                     type: string
 *                   totalProfit:
 *                     type: number
 *                   totalSalesAmount:
 *                     type: number
 *                   totalItemsSold:
 *                     type: number
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 */

// Routes using controller methods
router.get("/sales-by-staff", authMiddleware, roleMiddleware(["admin", "manager"]), getSalesByStaff);
router.get("/total-sales", authMiddleware, roleMiddleware(["admin", "manager"]), getTotalSales);
router.get("/low-stock", authMiddleware, roleMiddleware(["admin", "manager"]), getLowStock);
router.get("/profit", authMiddleware, roleMiddleware(["admin", "manager"]), getProfit);
router.get("/profit-by-product", authMiddleware, roleMiddleware(["admin", "manager"]), getProfitByProduct);
router.get("/profit-by-staff", authMiddleware, roleMiddleware(["admin", "manager"]), getProfitByStaff);

module.exports = router;