const express = require("express");
const router = express.Router();
const User = require("../models/User");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");

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

/**
 * @swagger
 * /api/auth/forgot-password:
 *   post:
 *     summary: Request a password reset token
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email:
 *                 type: string
 *                 example: online@example.com
 *     responses:
 *       200:
 *         description: Always returns a generic message. (In this implementation, also returns resetToken/resetPath for testing.)
 *       400:
 *         description: Email is required
 *       500:
 *         description: Server error
 */

/**
 * Forgot password
 * Generates a one-time reset token and stores its hash + expiry.
 * NOTE: This implementation returns the token in the response for easy frontend integration.
 * In a real production setup, you should email the reset link instead and NOT return the token.
 */
router.post("/forgot-password", async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ message: "Email is required" });

  try {
    const user = await User.findOne({ email }).select("+resetPasswordToken +resetPasswordExpires");

    // Always respond with success message to avoid account enumeration
    if (!user) {
      return res.json({ message: "If the email exists, a reset link will be sent." });
    }

    const resetToken = crypto.randomBytes(32).toString("hex");
    const resetTokenHash = crypto.createHash("sha256").update(resetToken).digest("hex");

    user.resetPasswordToken = resetTokenHash;
    user.resetPasswordExpires = new Date(Date.now() + 1000 * 60 * 30); // 30 minutes
    await user.save();

    const resetPath = `/api/auth/reset-password/${resetToken}`;

    res.json({
      message: "If the email exists, a reset link will be sent.",
      resetToken,
      resetPath,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/**
 * @swagger
 * /api/auth/reset-password/{token}:
 *   post:
 *     summary: Reset password using a reset token
 *     tags: [Auth]
 *     parameters:
 *       - in: path
 *         name: token
 *         required: true
 *         schema:
 *           type: string
 *         description: Password reset token
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [password]
 *             properties:
 *               password:
 *                 type: string
 *                 example: newStrongPassword
 *     responses:
 *       200:
 *         description: Password reset successful
 *       400:
 *         description: Invalid/expired token or invalid input
 *       500:
 *         description: Server error
 */

/**
 * Reset password
 * Consumes reset token and sets a new password.
 */
router.post("/reset-password/:token", async (req, res) => {
  const { token } = req.params;
  const { password } = req.body;

  if (!token) return res.status(400).json({ message: "Reset token is required" });
  if (!password) return res.status(400).json({ message: "Password is required" });
  if (String(password).length < 6) {
    return res.status(400).json({ message: "Password must be at least 6 characters" });
  }

  try {
    const resetTokenHash = crypto.createHash("sha256").update(token).digest("hex");

    const user = await User.findOne({
      resetPasswordToken: resetTokenHash,
      resetPasswordExpires: { $gt: new Date() },
    }).select("+resetPasswordToken +resetPasswordExpires");

    if (!user) {
      return res.status(400).json({ message: "Invalid or expired reset token" });
    }

    user.password = password;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    res.json({ message: "Password reset successful" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;