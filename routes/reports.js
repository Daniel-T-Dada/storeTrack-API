
const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const Sale = require("../models/Sale");
const Staff = require("../models/Staff");
const { authMiddleware } = require("../middleware/auth");
const Product = require("../models/Product");

const {
  getSalesByStaff,
  getTotalSales,
  getLowStock,
  getProfit,
  getProfitByProduct,
  getProfitByStaff,
} = require("../controllers/reportsController");
router.get("/sales-by-staff", authMiddleware, getSalesByStaff);
router.get("/total-sales", authMiddleware, getTotalSales);
router.get("/low-stock", authMiddleware, getLowStock);
router.get("/profit", authMiddleware, getProfit);
router.get("/profit-by-product", authMiddleware, getProfitByProduct);
router.get("/profit-by-staff", authMiddleware, getProfitByStaff);


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
 *     summary: Get total sales grouped by staff
 *     tags: [Reports]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *     responses:
 *       200:
 *         description: Sales grouped by staff
 */
router.get("/sales-by-staff", authMiddleware, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    const match = { store: req.user._id };

    if (startDate || endDate) {
      match.createdAt = {};
      if (startDate) match.createdAt.$gte = new Date(startDate);
      if (endDate) match.createdAt.$lte = new Date(endDate);
    }

    const report = await Sale.aggregate([
      { $match: match },
      {
        $group: {
          _id: "$staff",
          totalSales: { $sum: "$totalPrice" },
          totalQuantity: { $sum: "$quantity" },
        },
      },
      {
        $lookup: {
          from: "staffs",
          localField: "_id",
          foreignField: "_id",
          as: "staff",
        },
      },
      { $unwind: "$staff" },
      {
        $project: {
          _id: 0,
          staffId: "$staff._id",
          staffName: "$staff.name",
          totalSales: 1,
          totalQuantity: 1,
        },
      },
    ]);

    res.json(report);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});



/**
 * @swagger
 * /api/reports/total-sales:
 *   get:
 *     summary: Get total sales amount
 *     tags: [Reports]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Total sales value
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 totalSales:
 *                   type: number
 */
router.get("/total-sales", authMiddleware, async (req, res) => {
  try {
    const result = await Sale.aggregate([
      { $match: { store: req.user._id } },
      { $group: { _id: null, totalSales: { $sum: "$totalPrice" } } },
    ]);

    res.json({ totalSales: result[0]?.totalSales || 0 });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});


/**
 * @swagger
 * /api/reports/low-stock:
 *   get:
 *     summary: Get products with low stock
 *     tags: [Reports]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of low-stock products
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   _id:
 *                     type: string
 *                   name:
 *                     type: string
 *                   quantity:
 *                     type: number
 *                   lowStockThreshold:
 *                     type: number
 */
router.get("/low-stock", authMiddleware, async (req, res) => {
  try {
    const products = await Product.find({
      store: req.user._id,
      $expr: { $lte: ["$quantity", "$lowStockThreshold"] },
    }).sort({ quantity: 1 });

    res.json(products);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/**
 * @swagger
 * /api/reports/profit:
 *   get:
 *     summary: Get total revenue, profit and margin
 *     tags: [Reports]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Profit summary
 */
router.get("/profit", authMiddleware, async (req, res) => {
  const result = await Sale.aggregate([
    { $match: { store: req.user._id } },
    {
      $group: {
        _id: null,
        revenue: { $sum: "$totalPrice" },
        profit: { $sum: "$profit" },
      },
    },
  ]);

  const revenue = result[0]?.revenue || 0;
  const profit = result[0]?.profit || 0;
  const margin = revenue > 0 ? ((profit / revenue) * 100).toFixed(2) : 0;

  res.json({ revenue, profit, margin });
});

/**
 * @swagger
 * /api/reports/profit-by-product:
 *   get:
 *     summary: Profit per product
 *     tags: [Reports]
 *     security:
 *       - bearerAuth: []
 */
router.get("/profit-by-product", authMiddleware, async (req, res) => {
  const report = await Sale.aggregate([
    { $match: { store: req.user._id } },
    {
      $group: {
        _id: "$product",
        revenue: { $sum: "$totalPrice" },
        profit: { $sum: "$profit" },
      },
    },
    {
      $lookup: {
        from: "products",
        localField: "_id",
        foreignField: "_id",
        as: "product",
      },
    },
    { $unwind: "$product" },
  ]);

  res.json(report);
});

router.get("/profit-by-staff", authMiddleware, async (req, res) => {
  try {
    const data = await Sale.aggregate([
      { $match: { store: req.user._id } },

      {
        $lookup: {
          from: "products",
          localField: "product",
          foreignField: "_id",
          as: "product",
        },
      },
      { $unwind: "$product" },

      {
        $addFields: {
          profit: {
            $subtract: [
              "$totalPrice",
              { $multiply: ["$product.costPrice", "$quantity"] },
            ],
          },
        },
      },

      {
        $group: {
          _id: "$staff",
          totalProfit: { $sum: "$profit" },
          totalSalesAmount: { $sum: "$totalPrice" },
          totalItemsSold: { $sum: "$quantity" },
        },
      },

      {
        $lookup: {
          from: "staffs",
          localField: "_id",
          foreignField: "_id",
          as: "staff",
        },
      },
      { $unwind: "$staff" },

      {
        $project: {
          _id: 0,
          staffId: "$staff._id",
          staffName: "$staff.name",
          totalProfit: 1,
          totalSalesAmount: 1,
          totalItemsSold: 1,
        },
      },
    ]);

    res.json(data);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;




