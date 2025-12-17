const express = require("express");
const router = express.Router();
const { body, validationResult } = require("express-validator");
const Product = require("../models/Product");
const { authMiddleware } = require("../middleware/auth");

/**
 * @swagger
 * tags:
 *   name: Products
 *   description: Manage store products
 */

/**
 * @swagger
 * /api/products:
 *   post:
 *     summary: Add a new product
 *     tags: [Products]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - price
 *               - quantity
 *             properties:
 *               name:
 *                 type: string
 *                 example: Milk
 *               price:
 *                 type: number
 *                 example: 500
 *               costPrice:
 *                 type: number
 *                 example: 350
 *               quantity:
 *                 type: integer
 *                 example: 10
 *               lowStockThreshold:
 *                type: integer
 *                example: 5
 *               description:
 *                 type: string
 *                 example: Fresh milk from local farm
 *     responses:
 *       201:
 *         description: Product created successfully
 */
router.post(
  "/",
  authMiddleware,
  [
    body("name").notEmpty().withMessage("Name is required"),
    body("price").isNumeric().withMessage("Price must be a number"),
    body("quantity").isInt({ min: 0 }).withMessage("Quantity must be non-negative"),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    try {
      const product = await Product.create({ ...req.body, store: req.user._id });
      res.status(201).json(product);
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  }
);

/**
 * @swagger
 * /api/products:
 *   get:
 *     summary: Get all products for the logged-in store
 *     tags: [Products]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of products
 */
router.get("/", authMiddleware, async (req, res) => {
  try {
    const products = await Product.find({ store: req.user._id });
    res.json(products);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/**
 * @swagger
 * /api/products/{id}:
 *   put:
 *     summary: Update a product
 *     tags: [Products]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Product ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 example: Milk
 *               price:
 *                 type: number
 *                 example: 550
 *               costPrice:
 *                 type: number
 *                 example: 350
 *               quantity:
 *                 type: integer
 *                 example: 15
 *              lowStockThreshold:
 *                type: integer
 *                example: 5
 *               description:
 *                 type: string
 *                 example: Updated description
 *     responses:
 *       200:
 *         description: Product updated
 */
router.put("/:id", authMiddleware, async (req, res) => {
  try {
    const product = await Product.findOneAndUpdate(
      { _id: req.params.id, store: req.user._id },
      req.body,
      { new: true }
    );
    if (!product) return res.status(404).json({ message: "Product not found or access denied" });
    res.json(product);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/**
 * @swagger
 * /api/products/{id}:
 *   delete:
 *     summary: Delete a product
 *     tags: [Products]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Product ID
 *     responses:
 *       200:
 *         description: Product deleted
 */
router.delete("/:id", authMiddleware, async (req, res) => {
  try {
    const product = await Product.findOneAndDelete({ _id: req.params.id, store: req.user._id });
    if (!product) return res.status(404).json({ message: "Product not found or access denied" });
    res.json({ message: "Product deleted" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;