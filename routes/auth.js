const express = require("express");
const router = express.Router();
const User = require("../models/User");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

/**
 * Helper to generate access + refresh tokens
 */
const generateTokens = (userId) => {
  const accessToken = jwt.sign({ id: userId }, process.env.JWT_ACCESS_SECRET, {
    expiresIn: process.env.JWT_ACCESS_EXPIRES,
  });

  const refreshToken = jwt.sign({ id: userId }, process.env.JWT_REFRESH_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRES,
  });

  return { accessToken, refreshToken };
};

/**
 * @swagger
 * tags:
 *   name: Auth
 *   description: Store admin authentication
 */

/**
 * @swagger
 * /api/auth/register:
 *   post:
 *     summary: Register a store admin
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, email, password, store]
 *             properties:
 *               name:
 *                 type: string
 *                 example: Tobi
 *               email:
 *                 type: string
 *                 example: tobi@example.com
 *               password:
 *                 type: string
 *                 example: 12345
 *               store:
 *                 type: string
 *                 example: 6940b0ac8cd0de88d7f36cbd
 *     responses:
 *       201:
 *         description: User registered successfully
 *       400:
 *         description: User already exists
 *       500:
 *         description: Server error
 */
router.post("/register", async (req, res) => {
  try {
    const { name, email, password, store } = req.body;

    // Check if user exists
    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ message: "User already exists" });

    // Create user
    const user = await User.create({ name, email, password, store });

    // Generate tokens
    const tokens = generateTokens(user._id);

    // Store refresh token in user record
    user.refreshToken = tokens.refreshToken;
    await user.save();

    // Exclude password before sending response
    const { password: pwd, ...userData } = user.toObject();

    res.status(201).json({ user: userData, tokens });
  } catch (err) {
    res.status(500).json({ message: err.message, stack: err.stack });
  }
});

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: Login a store admin
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email:
 *                 type: string
 *                 example: tobi@example.com
 *               password:
 *                 type: string
 *                 example: 12345
 *     responses:
 *       200:
 *         description: Login successful
 *       400:
 *         description: Invalid credentials
 *       500:
 *         description: Server error
 */
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email }).select("+password +refreshToken");
    if (!user) return res.status(400).json({ message: "Invalid credentials" });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ message: "Invalid credentials" });

    const tokens = generateTokens(user._id);

    // Update refresh token in DB
    user.refreshToken = tokens.refreshToken;
    await user.save();

    // Exclude password
    const { password: pwd, ...userData } = user.toObject();

    res.json({ user: userData, tokens });
  } catch (err) {
    res.status(500).json({ message: err.message, stack: err.stack });
  }
});

/**
 * @swagger
 * /api/auth/refresh:
 *   post:
 *     summary: Refresh access token
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [refreshToken]
 *             properties:
 *               refreshToken:
 *                 type: string
 *     responses:
 *       200:
 *         description: Tokens refreshed
 *       400:
 *         description: Refresh token required
 *       401:
 *         description: Invalid refresh token
 */
router.post("/refresh", async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) return res.status(400).json({ message: "Refresh token required" });

  try {
    // Verify token
    const payload = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);

    const user = await User.findById(payload.id).select("+refreshToken");
    if (!user || user.refreshToken !== refreshToken)
      return res.status(401).json({ message: "Invalid refresh token" });

    // Generate new tokens
    const tokens = generateTokens(user._id);

    // Update refresh token in DB
    user.refreshToken = tokens.refreshToken;
    await user.save();

    res.json({ tokens });
  } catch (err) {
    res.status(401).json({ message: "Invalid refresh token", stack: err.stack });
  }
});

module.exports = router;