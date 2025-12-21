const express = require("express");
const router = express.Router();
const { body, validationResult } = require("express-validator");
const Staff = require("../models/Staff");
const { authMiddleware } = require("../middleware/auth");
const roleMiddleware = require("../middleware/roleMiddleware");

const normalizeValidationErrors = (errorsResult) =>
  errorsResult.array().map((e) => ({ msg: e.msg, path: e.path || e.param }));


/**
 * @swagger
 * tags:
 *   name: Staff
 *   description: Only `admin` or `manager` can create staff members
 */

/**
 * @swagger
 * /api/staff:
 *   post:
 *     summary: Add a staff member
 *     tags: [Staff]
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
 *               - email
 *               - password
 *             properties:
 *               name:
 *                 type: string
 *                 example: Jane
 *               email:
 *                 type: string
 *                 example: jane@example.com
 *               password:
 *                 type: string
 *                 example: password123
 *               role:
 *                 type: string
 *                 description: Optional. Defaults to staff.
 *                 example: staff
 *     responses:
 *       201:
 *         description: Staff added
 */
router.post("/", authMiddleware, roleMiddleware(["admin", "manager"]), async (req, res) => {
  const { name, email, password, role } = req.body;
  try {
    const errors = [];
    if (!name) errors.push({ msg: "name is required", path: "name" });
    if (!email) errors.push({ msg: "email is required", path: "email" });
    if (email && !String(email).includes("@")) errors.push({ msg: "email must be valid", path: "email" });
    if (!password) errors.push({ msg: "password is required", path: "password" });
    if (password && String(password).length < 6) errors.push({ msg: "password must be at least 6 characters", path: "password" });

    if (errors.length) {
      return res.status(400).json({ message: "Validation error", errors });
    }

    const normalizedEmail = String(email).toLowerCase().trim();
    const existing = await Staff.findOne({ email: normalizedEmail, store: req.storeId });
    if (existing) {
      return res.status(400).json({
        message: "Validation error",
        errors: [{ msg: "Staff with this email already exists", path: "email" }],
      });
    }

    const staff = await Staff.create({
      name,
      email: normalizedEmail,
      password,
      role,
      store: req.storeId,
    });
    res.status(201).json(staff.toJSON());
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});


/**
 * @swagger
 * /api/staff:
 *   get:
 *     summary: Get all staff members for the logged-in store
 *     tags: [Staff]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: List of staff
 */
router.get("/", authMiddleware, roleMiddleware(["admin", "manager"]), async (req, res) => {
  try {
    const staffList = await Staff.find({ store: req.storeId });
    res.json(staffList);
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
 *       - cookieAuth: []
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
router.delete("/:id", authMiddleware, roleMiddleware(["admin"]), async (req, res) => {
  try {
    const staff = await Staff.findOne({ _id: req.params.id, store: req.storeId });
    if (!staff) return res.status(404).json({ message: "Staff not found" });

    await staff.deleteOne();
    res.json({ message: "Staff deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});


module.exports = router;