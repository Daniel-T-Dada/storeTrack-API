const express = require("express");
const router = express.Router();
const { body, validationResult } = require("express-validator");
const Product = require("../models/Product");
const { authMiddleware } = require("../middleware/auth");
const roleMiddleware = require("../middleware/roleMiddleware");

const normalizeValidationErrors = (errorsResult) =>
  errorsResult.array().map((e) => ({ msg: e.msg, path: e.path || e.param }));

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
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - price
 *               - costPrice
 *               - quantity
 *             properties:
 *               name:
 *                 type: string
 *                 example: Milk
 *               sku:
 *                 type: string
 *                 example: SKU-001
 *               barcode:
 *                 type: string
 *                 example: 1234567890123
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
 *                 type: integer
 *                 example: 5
 *               description:
 *                 type: string
 *                 example: Fresh milk from local farm
 *     responses:
 *       201:
 *         description: Product created successfully
 */
// router.post("/", authMiddleware, roleMiddleware(["admin", "manager", "staff"]), async (req, res) => {
router.post(
  "/",
  authMiddleware,
  roleMiddleware(["admin", "manager"]),
  [
    body("name").notEmpty().withMessage("Name is required"),
    body("price").isNumeric().withMessage("Price must be a number"),
    body("costPrice").isNumeric().withMessage("Cost price must be a number"),
    body("quantity").isInt({ min: 0 }).withMessage("Quantity must be non-negative"),
    body("sku").optional().isString().withMessage("sku must be a string"),
    body("barcode").optional().isString().withMessage("barcode must be a string"),
    body("lowStockThreshold").optional().isInt({ min: 0 }).withMessage("lowStockThreshold must be non-negative"),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: "Validation error", errors: normalizeValidationErrors(errors) });
    }

    try {
      const product = await Product.create({ ...req.body, store: req.storeId });
      res.status(201).json(product);
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  }
);

/**
 * @swagger
 * /api/products/search:
 *   get:
 *     summary: Search products by name/SKU/barcode
 *     tags: [Products]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *         description: Search query (matches name, sku, barcode)
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *         description: Max results (1-100)
 *     responses:
 *       200:
 *         description: Lightweight product list
 */
router.get("/search", authMiddleware, roleMiddleware(["admin", "manager", "staff"]), async (req, res) => {
  try {
    const q = String(req.query.q ?? "").trim();
    const limit = Math.min(Math.max(parseInt(req.query.limit ?? "20", 10) || 20, 1), 100);

    if (!q) return res.status(400).json({ message: "q is required" });

    const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");

    const products = await Product.find({
      store: req.storeId,
      $or: [{ name: rx }, { sku: rx }, { barcode: rx }],
    })
      .select("name price quantity sku barcode")
      .limit(limit);

    res.json(products);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/**
 * @swagger
 * /api/products/lookup:
 *   get:
 *     summary: Lookup a product by SKU or barcode
 *     tags: [Products]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: sku
 *         schema:
 *           type: string
 *         description: SKU value
 *       - in: query
 *         name: barcode
 *         schema:
 *           type: string
 *         description: Barcode value
 *     responses:
 *       200:
 *         description: Product
 *       404:
 *         description: Not found
 */
router.get("/lookup", authMiddleware, roleMiddleware(["admin", "manager", "staff"]), async (req, res) => {
  try {
    const sku = String(req.query.sku ?? "").trim();
    const barcode = String(req.query.barcode ?? "").trim();

    if (!sku && !barcode) {
      return res.status(400).json({ message: "Provide sku or barcode" });
    }
    if (sku && barcode) {
      return res.status(400).json({ message: "Provide only one of sku or barcode" });
    }

    const filter = { store: req.storeId };
    if (sku) filter.sku = sku;
    if (barcode) filter.barcode = barcode;

    const product = await Product.findOne(filter).select("name price quantity sku barcode");
    if (!product) return res.status(404).json({ message: "Product not found" });

    res.json(product);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/**
 * @swagger
 * /api/products:
 *   get:
 *     summary: Get all products for the logged-in store
 *     tags: [Products]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: List of products
 */
router.get("/", authMiddleware, roleMiddleware(["admin", "manager", "staff"]), async (req, res) => {
  try {
    const products = await Product.find({ store: req.storeId });
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
 *       - cookieAuth: []
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
 *               sku:
 *                 type: string
 *                 example: SKU-001
 *               barcode:
 *                 type: string
 *                 example: 1234567890123
 *               price:
 *                 type: number
 *                 example: 550
 *               costPrice:
 *                 type: number
 *                 example: 350
 *               quantity:
 *                 type: integer
 *                 example: 15
 *               lowStockThreshold:
 *                 type: integer
 *                 example: 5
 *               description:
 *                 type: string
 *                 example: Updated description
 *     responses:
 *       200:
 *         description: Product updated
 */
router.put("/:id", authMiddleware, roleMiddleware(["admin", "manager"]), async (req, res) => {
  try {
    const product = await Product.findOneAndUpdate(
      { _id: req.params.id, store: req.storeId },
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
 *       - cookieAuth: []
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
router.delete("/:id", authMiddleware, roleMiddleware(["admin", "manager"]), async (req, res) => {
  try {
    const product = await Product.findOneAndDelete({ _id: req.params.id, store: req.storeId });
    if (!product) return res.status(404).json({ message: "Product not found or access denied" });
    res.json({ message: "Product deleted" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;