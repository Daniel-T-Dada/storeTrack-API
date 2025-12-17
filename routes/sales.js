const express = require("express");
const router = express.Router();
const { body, validationResult } = require("express-validator");
const Sale = require("../models/Sale");
const { authMiddleware } = require("../middleware/auth");
const Product = require("../models/Product");

/**
 * @swagger
 * tags:
 *   name: Sales
 *   description: Record and view sales
 */

/**
 * @swagger
 * /api/sales:
 *   post:
 *     summary: Record a sale and update stock
 *     tags: [Sales]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - product
 *               - quantity
 *               - staff
 *             properties:
 *               product:
 *                 type: string
 *               quantity:
 *                 type: integer
 *               staff:
 *                 type: string
 *     responses:
 *       201:
 *         description: Sale recorded successfully
 *       400:
 *         description: Insufficient stock
 */

router.post("/", authMiddleware, async (req, res) => {
  try {
    const { product, staff, quantity, totalPrice } = req.body;

    // Fetch product safely
    const productDoc = await Product.findOne({
      _id: product,
      store: req.user._id,
    });

    if (!productDoc)
      return res.status(404).json({ message: "Product not found" });

    if (productDoc.quantity < quantity)
      return res.status(400).json({ message: "Insufficient stock" });

    // Reduce stock
    productDoc.quantity -= quantity;
    await productDoc.save();

    const sale = await Sale.create({
      product,
      staff,
      quantity,
      totalPrice,
      store: req.user._id,
    });

    res.status(201).json(sale);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/**
 * @swagger
 * /api/sales:
 *   get:
 *     summary: Get all sales for the logged-in store
 *     tags: [Sales]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of sales
 */
router.get("/", authMiddleware, async (req, res) => {
  try {
    const sales = await Sale.find({ store: req.user._id }).populate("product staff");
    res.json(sales);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;