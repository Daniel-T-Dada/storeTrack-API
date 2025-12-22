const express = require("express");
const router = express.Router();
const { body, validationResult } = require("express-validator");
const Sale = require("../models/Sale");
const { authMiddleware } = require("../middleware/auth");
const roleMiddleware = require("../middleware/roleMiddleware");
const Product = require("../models/Product");
const Staff = require("../models/Staff");
const mongoose = require("mongoose");

const normalizeValidationErrors = (errorsResult) =>
  errorsResult.array().map((e) => ({ msg: e.msg, path: e.path || e.param }));

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
 *     description: |
 *       Cashier attribution rules:
 *       - Staff tokens: sale is tied to the logged-in staff (request body `staff` is ignored).
 *       - Admin/manager user tokens: sale is tied to the logged-in user (do NOT send `staff`).
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
 *               - product
 *               - quantity
 *             properties:
 *               product:
 *                 type: string
 *                 description: Product ID
 *               quantity:
 *                 type: integer
 *                 description: Quantity being sold
 *               staff:
 *                 type: string
 *                 deprecated: true
 *                 description: Deprecated. Do not send. Sales are attributed automatically based on the authenticated account.
 *     responses:
 *       201:
 *         description: Sale recorded successfully
 *       400:
 *         description: Insufficient stock or validation error
 *       404:
 *         description: Product not found
 *       500:
 *         description: Server error
 */

/**
 * @swagger
 * /api/sales/checkout:
 *   post:
 *     summary: Checkout multiple items (atomic)
 *     tags: [Sales]
 *     description: |
 *       Creates one transaction with multiple line items. Stock deductions and sale creation are atomic.
 *
 *       Cashier attribution rules:
 *       - Staff tokens: checkout is tied to the logged-in staff (request body `staff` is ignored).
 *       - Admin/manager user tokens: checkout is tied to the logged-in user (do NOT send `staff`).
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [items]
 *             properties:
 *               items:
 *                 type: array
 *                 minItems: 1
 *                 items:
 *                   type: object
 *                   required: [product, quantity]
 *                   properties:
 *                     product:
 *                       type: string
 *                     quantity:
 *                       type: integer
 *                       minimum: 1
 *               staff:
 *                 type: string
 *                 deprecated: true
 *                 description: Deprecated. Do not send. Checkout is attributed automatically based on the authenticated account.
 *               client:
 *                 type: object
 *                 properties:
 *                   expectedTotal:
 *                     type: number
 *     responses:
 *       201:
 *         description: Transaction created
 *       400:
 *         description: Validation error or insufficient stock
 *       404:
 *         description: Product not found
 */

router.post(
  "/checkout",
  authMiddleware,
  roleMiddleware(["admin", "manager", "staff"]),
  [
    body("items").isArray({ min: 1 }).withMessage("items must be a non-empty array"),
    body("items.*.product").isMongoId().withMessage("Each item product must be a valid id"),
    body("items.*.quantity").isInt({ min: 1 }).withMessage("Each item quantity must be at least 1"),
    body("staff").optional().isString(),
    body("client.expectedTotal").optional().isNumeric(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: "Validation error", errors: normalizeValidationErrors(errors) });
    }

    const session = await mongoose.startSession();
    try {
      const items = Array.isArray(req.body.items) ? req.body.items : [];

      // Merge duplicate products (industry POS behavior)
      const merged = new Map();
      for (const item of items) {
        const productId = String(item.product);
        const qty = Number(item.quantity);
        if (!productId || !Number.isFinite(qty) || qty < 1) continue;
        merged.set(productId, (merged.get(productId) || 0) + qty);
      }

      if (merged.size === 0) {
        return res.status(400).json({
          message: "Validation error",
          errors: [{ msg: "items must include at least one valid product", path: "items" }],
        });
      }

      let staffId = null;
      let cashierType = "user";
      let cashierUser = null;
      let cashierNameSnapshot = null;

      // Staff users: always auto-assign
      if (req.userType === "staff") {
        staffId = req.user._id;
        cashierType = "staff";
        cashierUser = null;
        cashierNameSnapshot = req.user?.name || null;
      } else {
        // Admin/manager: record as the logged-in user (no staff attribution)
        if (req.body.staff) {
          return res.status(400).json({
            message: "Validation error",
            errors: [{ msg: "Do not provide staff when recording sales as admin/manager", path: "staff" }],
          });
        }

        cashierType = "user";
        cashierUser = req.user?._id || null;
        cashierNameSnapshot = req.user?.name || null;
      }

      const transactionId = new mongoose.Types.ObjectId();

      let serverTotal = 0;
      const saleInputs = [];
      let createdSales = [];

      await session.withTransaction(async () => {
        for (const [productId, qty] of merged.entries()) {
          // Atomically decrement stock if enough quantity exists
          const productDoc = await Product.findOneAndUpdate(
            { _id: productId, store: req.storeId, quantity: { $gte: qty } },
            { $inc: { quantity: -qty } },
            { new: true, session }
          );

          if (!productDoc) {
            const existing = await Product.findOne({ _id: productId, store: req.storeId })
              .select("name quantity")
              .session(session);

            if (!existing) {
              const err = new Error("Product not found in this store");
              err.status = 404;
              err.details = { productId, storeId: String(req.storeId) };
              throw err;
            }

            const err = new Error("Insufficient stock");
            err.status = 400;
            err.details = {
              productId,
              productName: existing.name,
              available: existing.quantity,
              requested: qty,
            };
            throw err;
          }

          const unitPrice = Number(productDoc.price);
          if (!Number.isFinite(unitPrice)) {
            const err = new Error("Invalid product pricing");
            err.status = 400;
            err.details = {
              productId,
              field: "price",
              value: productDoc.price,
              message: "Product price must be a valid number",
            };
            throw err;
          }

          const unitCostCandidate = Number(productDoc.costPrice);
          const unitCostPrice = Number.isFinite(unitCostCandidate) ? unitCostCandidate : null;
          const totalPrice = unitPrice * qty;
          serverTotal += totalPrice;

          saleInputs.push({
            transactionId,
            product: productDoc._id,
            productNameSnapshot: productDoc.name,
            unitPrice,
            unitCostPrice,
            staff: staffId,
            cashierType,
            cashierUser,
            cashierNameSnapshot,
            quantity: qty,
            totalPrice,
            store: req.storeId,
          });
        }

        createdSales = await Sale.insertMany(saleInputs, { session });
      });

      const clientExpectedTotal = req.body?.client?.expectedTotal;
      const clientExpectedNumber = Number(clientExpectedTotal);
      const hasClientExpected = Number.isFinite(clientExpectedNumber);

      res.status(201).json({
        transaction: {
          id: transactionId,
          staff: staffId,
          staffName: cashierNameSnapshot,
          cashierType,
          cashierUser,
          cashierName: cashierNameSnapshot,
          itemsCount: merged.size,
          total: serverTotal,
          createdAt: createdSales[0]?.createdAt || new Date(),
        },
        sales: createdSales,
        validation: {
          clientExpectedTotal: hasClientExpected ? clientExpectedNumber : null,
          serverTotal,
          matches: hasClientExpected ? clientExpectedNumber === serverTotal : null,
        },
      });
    } catch (err) {
      const status = err.status || 500;
      if (status === 400 || status === 404) {
        return res.status(status).json({ message: err.message, details: err.details });
      }
      res.status(500).json({ message: err.message });
    } finally {
      session.endSession();
    }
  }
);

router.post(
  "/",
  authMiddleware,
  roleMiddleware(["admin", "manager", "staff"]),
  [
    body("product").isMongoId().withMessage("Product must be a valid id"),
    body("quantity").isInt({ min: 1 }).withMessage("Quantity must be at least 1"),
    body("staff").optional().isString(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: "Validation error", errors: normalizeValidationErrors(errors) });
    }

    try {
      const { product, quantity } = req.body;
      let staffId = null;
      let cashierType = "user";
      let cashierUser = null;
      let cashierNameSnapshot = null;

      // Auto-assign staff if logged-in user is staff
      if (req.userType === "staff") {
        staffId = req.user._id;
        cashierType = "staff";
        cashierUser = null;
        cashierNameSnapshot = req.user?.name || null;
      } else {
        // Admin/manager: record as the logged-in user (no staff attribution)
        if (req.body.staff) {
          return res.status(400).json({
            message: "Validation error",
            errors: [{ msg: "Do not provide staff when recording sales as admin/manager", path: "staff" }],
          });
        }
        cashierType = "user";
        cashierUser = req.user?._id || null;
        cashierNameSnapshot = req.user?.name || null;
      }

      // Atomically decrement stock if enough quantity exists
      const productDoc = await Product.findOneAndUpdate(
        { _id: product, store: req.storeId, quantity: { $gte: quantity } },
        { $inc: { quantity: -quantity } },
        { new: true }
      );

      if (!productDoc) {
        const existing = await Product.findOne({ _id: product, store: req.storeId }).select("name quantity");
        if (!existing) {
          return res.status(404).json({
            message: "Product not found in this store",
            details: { productId: product, storeId: String(req.storeId) },
          });
        }
        return res.status(400).json({
          message: "Insufficient stock",
          details: { productId: product, productName: existing.name, available: existing.quantity, requested: quantity },
        });
      }

      const unitPrice = Number(productDoc.price);
      if (!Number.isFinite(unitPrice)) {
        return res.status(400).json({
          message: "Invalid product pricing",
          details: {
            productId: product,
            field: "price",
            value: productDoc.price,
            message: "Product price must be a valid number",
          },
        });
      }

      const unitCostCandidate = Number(productDoc.costPrice);
      const unitCostPrice = Number.isFinite(unitCostCandidate) ? unitCostCandidate : null;
      const totalPrice = unitPrice * Number(quantity);
      const transactionId = new mongoose.Types.ObjectId();

      const sale = await Sale.create({
        transactionId,
        product,
        productNameSnapshot: productDoc.name,
        unitPrice,
        unitCostPrice,
        staff: staffId,
        cashierType,
        cashierUser,
        cashierNameSnapshot,
        quantity,
        totalPrice,
        store: req.storeId,
      });

      res.status(201).json(sale);
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  }
);

/**
 * @swagger
 * /api/sales/transactions:
 *   get:
 *     summary: List transaction summaries for the logged-in store
 *     tags: [Sales]
 *     description: Returns one row per transactionId (legacy single sales are treated as a 1-line transaction).
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: staff
 *         schema:
 *           type: string
 *         description: Optional staff ID filter (admin/manager only)
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date-time
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date-time
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *     responses:
 *       200:
 *         description: Transaction list
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/TransactionListResponse'
 */
router.get("/transactions", authMiddleware, roleMiddleware(["admin", "manager", "staff"]), async (req, res) => {
  try {
    const { staff, startDate, endDate, page, limit } = req.query;

    const parsedLimit = Math.min(Math.max(parseInt(limit ?? "50", 10) || 50, 1), 200);
    const parsedPage = Math.max(parseInt(page ?? "1", 10) || 1, 1);

    const match = { store: req.storeId };

    if (req.userType === "staff") {
      match.staff = req.user._id;
    } else if (["admin", "manager"].includes(req.user.role) && staff) {
      if (!mongoose.isValidObjectId(String(staff))) {
        return res.status(400).json({
          message: "Validation error",
          errors: [{ msg: "staff must be a valid id", path: "staff" }],
        });
      }
      match.staff = new mongoose.Types.ObjectId(String(staff));
    }

    if (startDate || endDate) {
      match.createdAt = {};
      if (startDate) match.createdAt.$gte = new Date(String(startDate));
      if (endDate) match.createdAt.$lte = new Date(String(endDate));
    }

    const staffCollection = Staff.collection?.name || "staffs";

    const pipeline = [
      { $match: match },
      { $addFields: { txId: { $ifNull: ["$transactionId", "$_id"] } } },
      {
        $group: {
          _id: "$txId",
          staff: { $first: "$staff" },
          cashierType: { $first: "$cashierType" },
          cashierUser: { $first: "$cashierUser" },
          cashierNameSnapshot: { $first: "$cashierNameSnapshot" },
          createdAt: { $min: "$createdAt" },
          lastCreatedAt: { $max: "$createdAt" },
          total: { $sum: "$totalPrice" },
          itemsCount: { $sum: 1 },
          totalQuantity: { $sum: "$quantity" },
        },
      },
      { $sort: { lastCreatedAt: -1, _id: -1 } },
      {
        $facet: {
          data: [
            { $skip: (parsedPage - 1) * parsedLimit },
            { $limit: parsedLimit },
            {
              $lookup: {
                from: staffCollection,
                localField: "staff",
                foreignField: "_id",
                as: "staffDoc",
              },
            },
            {
              $addFields: {
                staffName: {
                  $ifNull: ["$cashierNameSnapshot", { $arrayElemAt: ["$staffDoc.name", 0] }],
                },
              },
            },
            {
              $project: {
                _id: 0,
                id: { $toString: "$_id" },
                staff: { $toString: "$staff" },
                staffName: 1,
                cashierType: { $ifNull: ["$cashierType", "staff"] },
                cashierUser: { $toString: "$cashierUser" },
                cashierName: { $ifNull: ["$cashierNameSnapshot", "$staffName"] },
                createdAt: 1,
                lastCreatedAt: 1,
                total: 1,
                itemsCount: 1,
                totalQuantity: 1,
              },
            },
          ],
          meta: [{ $count: "total" }],
        },
      },
    ];

    const agg = await Sale.aggregate(pipeline);
    const data = agg?.[0]?.data ?? [];
    const total = agg?.[0]?.meta?.[0]?.total ?? 0;

    res.json({
      data,
      meta: {
        total,
        limit: parsedLimit,
        page: parsedPage,
      },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/**
 * @swagger
 * /api/sales/transactions/{transactionId}:
 *   get:
 *     summary: Fetch a single transaction summary and its line items
 *     tags: [Sales]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: transactionId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Transaction
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/TransactionDetailsResponse'
 *       404:
 *         description: Not found
 */
router.get(
  "/transactions/:transactionId",
  authMiddleware,
  roleMiddleware(["admin", "manager", "staff"]),
  async (req, res) => {
    try {
      const rawId = String(req.params.transactionId ?? "").trim();
      if (!mongoose.isValidObjectId(rawId)) {
        return res.status(400).json({
          message: "Validation error",
          errors: [{ msg: "transactionId must be a valid id", path: "transactionId" }],
        });
      }

      const oid = new mongoose.Types.ObjectId(rawId);
      const query = {
        store: req.storeId,
        $or: [{ transactionId: oid }, { _id: oid }],
      };

      if (req.userType === "staff") {
        query.staff = req.user._id;
      }

      const sales = await Sale.find(query).sort({ createdAt: 1 }).populate("product staff");
      if (!sales || sales.length === 0) return res.status(404).json({ message: "Transaction not found" });

      const txKey = sales[0].transactionId || sales[0]._id;
      const total = sales.reduce((sum, s) => sum + Number(s.totalPrice || 0), 0);
      const totalQuantity = sales.reduce((sum, s) => sum + Number(s.quantity || 0), 0);

      const createdAt = sales[0].createdAt;
      const lastCreatedAt = sales[sales.length - 1].createdAt;

      const firstStaff = sales[0].staff;
      const firstCashierType = sales[0].cashierType || (firstStaff ? "staff" : "user");
      const firstCashierUser = sales[0].cashierUser || null;
      const firstCashierName = sales[0].cashierNameSnapshot || firstStaff?.name || null;

      res.json({
        transaction: {
          id: String(txKey),
          staff: firstStaff?._id ? String(firstStaff._id) : String(firstStaff),
          staffName: firstCashierName,
          cashierType: firstCashierType,
          cashierUser: firstCashierUser ? String(firstCashierUser) : null,
          cashierName: firstCashierName,
          itemsCount: sales.length,
          totalQuantity,
          total,
          createdAt,
          lastCreatedAt,
        },
        sales,
      });
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  }
);

/**
 * @swagger
 * /api/sales/transactions/{transactionId}/receipt:
 *   get:
 *     summary: Fetch a POS-friendly transaction receipt payload
 *     tags: [Sales]
 *     description: Returns a flattened transaction summary and simplified line items, suitable for receipt/transaction views.
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: transactionId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Receipt payload
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/TransactionReceiptResponse'
 *       404:
 *         description: Not found
 */
router.get(
  "/transactions/:transactionId/receipt",
  authMiddleware,
  roleMiddleware(["admin", "manager", "staff"]),
  async (req, res) => {
    try {
      const rawId = String(req.params.transactionId ?? "").trim();
      if (!mongoose.isValidObjectId(rawId)) {
        return res.status(400).json({
          message: "Validation error",
          errors: [{ msg: "transactionId must be a valid id", path: "transactionId" }],
        });
      }

      const oid = new mongoose.Types.ObjectId(rawId);
      const query = {
        store: req.storeId,
        $or: [{ transactionId: oid }, { _id: oid }],
      };

      if (req.userType === "staff") {
        query.staff = req.user._id;
      }

      const sales = await Sale.find(query).sort({ createdAt: 1 }).populate("product staff");
      if (!sales || sales.length === 0) return res.status(404).json({ message: "Transaction not found" });

      const txKey = sales[0].transactionId || sales[0]._id;
      const createdAt = sales[0].createdAt;
      const lastCreatedAt = sales[sales.length - 1].createdAt;

      const firstStaff = sales[0].staff;
      const firstCashierType = sales[0].cashierType || (firstStaff ? "staff" : "user");
      const firstCashierUser = sales[0].cashierUser || null;
      const firstCashierName = sales[0].cashierNameSnapshot || firstStaff?.name || null;

      const lineItems = sales.map((s) => {
        const product = s.product;
        const productId = product?._id ? String(product._id) : String(s.product);
        const name = s.productNameSnapshot || product?.name;

        const unitPrice = Number(s.unitPrice ?? product?.price ?? 0);
        const qty = Number(s.quantity ?? 0);
        const total = Number(s.totalPrice ?? unitPrice * qty);

        return {
          saleId: String(s._id),
          productId,
          name,
          sku: product?.sku ?? null,
          barcode: product?.barcode ?? null,
          unitPrice,
          quantity: qty,
          total,
        };
      });

      const receiptTotal = lineItems.reduce((sum, li) => sum + Number(li.total || 0), 0);
      const totalQuantity = lineItems.reduce((sum, li) => sum + Number(li.quantity || 0), 0);

      res.json({
        transaction: {
          id: String(txKey),
          createdAt,
          lastCreatedAt,
          staff: firstStaff?._id ? String(firstStaff._id) : String(firstStaff),
          staffName: firstCashierName,
          cashierType: firstCashierType,
          cashierUser: firstCashierUser ? String(firstCashierUser) : null,
          cashierName: firstCashierName,
          itemsCount: lineItems.length,
          totalQuantity,
          total: receiptTotal,
        },
        items: lineItems,
      });
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  }
);

/**
 * @swagger
 * /api/sales:
 *   get:
 *     summary: Get all sales for the logged-in store
 *     tags: [Sales]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: staff
 *         schema:
 *           type: string
 *         description: Optional staff ID to filter sales (only allowed for admin/manager)
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
  *       - in: query
  *         name: sort
  *         schema:
  *           type: string
  *           example: -createdAt
  *         description: Sort by createdAt/totalPrice/quantity. Prefix with - for desc.
  *       - in: query
  *         name: page
  *         schema:
  *           type: integer
  *           default: 1
  *         description: Page number (used when cursor is not provided)
  *       - in: query
  *         name: limit
  *         schema:
  *           type: integer
  *           default: 50
  *         description: Page size (1-200)
  *       - in: query
  *         name: cursor
  *         schema:
  *           type: string
  *         description: Cursor for createdAt pagination (ISO date-time). When provided (and sorting by createdAt), returns nextCursor.
 *     responses:
 *       200:
  *         description: Sales list with pagination metadata
 *         content:
 *           application/json:
 *             schema:
  *               type: object
  *               properties:
  *                 data:
  *                   type: array
  *                   items:
  *                     $ref: '#/components/schemas/Sale'
  *                 meta:
  *                   type: object
  *                   properties:
  *                     total:
  *                       type: integer
  *                     limit:
  *                       type: integer
  *                     page:
  *                       type: integer
  *                       nullable: true
  *                     nextCursor:
  *                       type: string
  *                       nullable: true
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */

router.get("/", authMiddleware, async (req, res) => {
  try {
    const {
      staff,
      startDate,
      endDate,
      sort,
      page,
      limit,
      cursor,
    } = req.query;

    const parsedLimit = Math.min(Math.max(parseInt(limit ?? "50", 10) || 50, 1), 200);
    const parsedPage = Math.max(parseInt(page ?? "1", 10) || 1, 1);

    const allowedSortFields = new Set(["createdAt", "totalPrice", "quantity"]);
    const sortParam = String(sort ?? "-createdAt");
    const sortDir = sortParam.startsWith("-") ? -1 : 1;
    const sortField = sortParam.replace(/^-/, "");
    const effectiveSortField = allowedSortFields.has(sortField) ? sortField : "createdAt";
    const sortSpec = { [effectiveSortField]: sortDir, _id: sortDir };

    const query = { store: req.storeId };

    // Role scoping
    if (req.userType === "staff") {
      query.staff = req.user._id;
    } else if (["admin", "manager"].includes(req.user.role) && staff) {
      query.staff = staff;
    }

    // Date range
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    // Cursor-based pagination only supported for createdAt sorting
    if (cursor && effectiveSortField === "createdAt") {
      const cursorDate = new Date(String(cursor));
      if (!Number.isNaN(cursorDate.getTime())) {
        query.createdAt = query.createdAt || {};
        if (sortDir === -1) query.createdAt.$lt = cursorDate;
        else query.createdAt.$gt = cursorDate;
      }
    }

    const total = await Sale.countDocuments(query);

    let cursorNext = null;
    let q = Sale.find(query).sort(sortSpec).populate("product staff");

    if (cursor && effectiveSortField === "createdAt") {
      q = q.limit(parsedLimit + 1);
    } else {
      q = q.skip((parsedPage - 1) * parsedLimit).limit(parsedLimit);
    }

    const results = await q;
    let data = results;

    if (cursor && effectiveSortField === "createdAt" && results.length > parsedLimit) {
      data = results.slice(0, parsedLimit);
      const last = data[data.length - 1];
      cursorNext = last?.createdAt ? new Date(last.createdAt).toISOString() : null;
    }

    res.json({
      data,
      meta: {
        total,
        limit: parsedLimit,
        page: cursor ? null : parsedPage,
        nextCursor: cursorNext,
      },
    });

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});


module.exports = router;
