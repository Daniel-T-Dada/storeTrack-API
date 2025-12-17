const express = require("express");
const router = express.Router();
const { body, validationResult } = require("express-validator");
const Staff = require("../models/Staff");
const { authMiddleware } = require("../middleware/auth");

/**
 * @swagger
 * tags:
 *   name: Staff
 *   description: Manage store staff
 */

/**
 * @swagger
 * /api/staff:
 *   post:
 *     summary: Add a staff member
 *     tags: [Staff]
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
 *               - role
 *             properties:
 *               name:
 *                 type: string
 *                 example: Jane
 *               role:
 *                 type: string
 *                 example: cashier
 *     responses:
 *       201:
 *         description: Staff added
 */
router.post(
  "/",
  authMiddleware,
  [body("name").notEmpty().withMessage("Name is required")],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    try {
      const staff = await Staff.create({ ...req.body, store: req.user._id });
      res.status(201).json(staff);
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  }
);

/**
 * @swagger
 * /api/staff:
 *   get:
 *     summary: Get all staff members for the logged-in store
 *     tags: [Staff]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of staff
 */
router.get("/", authMiddleware, async (req, res) => {
  try {
    const staff = await Staff.find({ store: req.user._id });
    res.json(staff);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/**
 * @swagger
 * /api/staff/{id}:
 *   delete:
 *     summary: Delete a staff member
 *     tags: [Staff]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Staff ID
 *     responses:
 *       200:
 *         description: Staff deleted
 */
router.delete("/:id", authMiddleware, async (req, res) => {
  try {
    const staff = await Staff.findOneAndDelete({ _id: req.params.id, store: req.user._id });
    if (!staff) return res.status(404).json({ message: "Staff not found or access denied" });
    res.json({ message: "Staff deleted" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;