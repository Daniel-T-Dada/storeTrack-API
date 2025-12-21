const express = require("express");
const router = express.Router();
const User = require("../models/User");
const Staff = require("../models/Staff");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { getMe } = require("../controllers/authController");
const { authMiddleware } = require("../middleware/auth");
const { body, validationResult } = require("express-validator");
const multer = require("multer");
const { cloudinary, ensureCloudinaryConfigured, uploadBufferToCloudinary } = require("../config/cloudinary");

const normalizeValidationErrors = (items) =>
  items.map((e) => ({ msg: e.msg, path: e.path || e.param }));

const isProd = process.env.NODE_ENV === "production";

const buildCookieOptions = (maxAgeMs) => ({
  httpOnly: true,
  secure: isProd, // required for SameSite=None in modern browsers
  sameSite: isProd ? "none" : "lax",
  maxAge: maxAgeMs,
  path: "/",
});

const setAuthCookies = (res, tokens) => {
  // Defaults (override if you want different lifetimes)
  const accessMaxAgeMs = 1000 * 60 * 60 * 24; // 1 day
  const refreshMaxAgeMs = 1000 * 60 * 60 * 24 * 7; // 7 days

  res.cookie("accessToken", tokens.accessToken, buildCookieOptions(accessMaxAgeMs));
  res.cookie("refreshToken", tokens.refreshToken, buildCookieOptions(refreshMaxAgeMs));
};

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    if (!file?.mimetype?.startsWith("image/")) {
      return cb(new Error("Only image uploads are allowed"));
    }
    cb(null, true);
  },
});

/**
 * Helper to generate access + refresh tokens
 */
const generateTokens = (user) => {
  const accessToken = jwt.sign({ id: user._id, typ: "user", role: user.role }, process.env.JWT_ACCESS_SECRET, {
    expiresIn: process.env.JWT_ACCESS_EXPIRES,
  });

  const refreshToken = jwt.sign({ id: user._id, typ: "user" }, process.env.JWT_REFRESH_SECRET, {
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
 *     description: "On success, returns tokens and sets HttpOnly cookies: accessToken + refreshToken."
 *     security: []
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
 *                 example: 1234567890987654
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
    const { name, email, password, store } = req.body ?? {};

    if (!name || !email || !password || !store) {
      const errors = [];
      if (!name) errors.push({ msg: "name is required", path: "name" });
      if (!email) errors.push({ msg: "email is required", path: "email" });
      if (!password) errors.push({ msg: "password is required", path: "password" });
      if (!store) errors.push({ msg: "store is required", path: "store" });
      return res.status(400).json({ message: "Validation error", errors });
    }

    // Validate `store` based on schema type (backward/forward compatible).
    const storePath = User.schema?.path?.("store");
    if (storePath?.instance === "ObjectId") {
      if (!mongoose.isValidObjectId(store)) {
        return res.status(400).json({
          message: "Validation error",
          errors: [{ msg: "Invalid store id", path: "store" }],
          hint: "Expected a Mongo ObjectId (24-hex chars).",
        });
      }
    }

    // Check if user exists
    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ message: "User already exists" });

    // Create user
    const user = await User.create({ name, email, password, store });

    // Generate tokens
    const tokens = generateTokens(user);

    // Cookie-based auth support (also still returns JSON)
    setAuthCookies(res, tokens);

    // Store refresh token in user record
    user.refreshToken = tokens.refreshToken;
    await user.save();

    // Exclude password before sending response
    const { password: pwd, ...userData } = user.toObject();

    res.status(201).json({ user: userData, tokens });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: Login a store admin
 *     tags: [Auth]
 *     description: "On success, returns tokens and sets HttpOnly cookies: accessToken + refreshToken."
 *     security: []
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

    if (!email || !password) {
      const errors = [];
      if (!email) errors.push({ msg: "email is required", path: "email" });
      if (!password) errors.push({ msg: "password is required", path: "password" });
      return res.status(400).json({ message: "Validation error", errors });
    }

    const user = await User.findOne({ email }).select("+password +refreshToken");
    if (!user) return res.status(400).json({ message: "Invalid credentials" });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ message: "Invalid credentials" });

    const tokens = generateTokens(user);

    // Cookie-based auth support (also still returns JSON)
    setAuthCookies(res, tokens);

    // Update refresh token in DB
    user.refreshToken = tokens.refreshToken;
    await user.save();

    // Exclude password
    const { password: pwd, ...userData } = user.toObject();

    res.json({ user: userData, tokens });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

/**
 * @swagger
 * /api/auth/refresh:
 *   post:
 *     summary: Refresh access token
 *     tags: [Auth]
 *     description: "Send refreshToken in JSON body OR via HttpOnly refreshToken cookie. On success, returns new tokens and re-sets cookies."
 *     security: []
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: []
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
  const refreshToken = (req.body?.refreshToken ?? req.cookies?.refreshToken) || null;
  if (!refreshToken) {
    return res.status(400).json({
      message: "Validation error",
      errors: [{ msg: "Refresh token required", path: "refreshToken" }],
      hint: "Send JSON body like { \"refreshToken\": \"...\" } with Content-Type: application/json",
    });
  }

  try {
    // Verify token
    const payload = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);

    const user = await User.findById(payload.id).select("+refreshToken");
    if (!user || user.refreshToken !== refreshToken)
      return res.status(401).json({ message: "Invalid refresh token" });

    // Generate new tokens
    const tokens = generateTokens(user);

    // Cookie-based auth support (also still returns JSON)
    setAuthCookies(res, tokens);

    // Update refresh token in DB
    user.refreshToken = tokens.refreshToken;
    await user.save();

    res.json({ tokens });
  } catch (err) {
    res.status(401).json({ message: "Invalid refresh token" });
  }
});

/**
 * @swagger
 * /api/auth/forgot-password:
 *   post:
 *     summary: Request a password reset token
 *     tags: [Auth]
 *     security: []
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
 *     security: []
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


/**
 * @swagger
 * /api/auth/me:
 *   get:
 *     summary: Get current authenticated user
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Authenticated user info
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                   example: 65fae1c9d4...
 *                 name:
 *                   type: string
 *                   example: John Doe
 *                 email:
 *                   type: string
 *                   example: john@example.com
 *                 role:
 *                   type: string
 *                   example: staff
 *                 userType:
 *                   type: string
 *                   example: staff
 *                 store:
 *                   type: string
 *                   nullable: true
 *                 storeId:
 *                   type: string
 *                   nullable: true
 *       401:
 *         description: Unauthorized
 */
router.get("/me", authMiddleware, getMe);

/**
 * @swagger
 * /api/auth/me:
 *   patch:
 *     summary: Update current user's profile (admin/manager/staff)
 *     tags: [Auth]
 *     description: "Currently supports updating profileImage (optional). For true binary uploads, use /api/auth/me/profile-image."
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               profileImage:
 *                 oneOf:
 *                   - type: string
 *                   - type: 'null'
 *                 description: "Profile image URL or data URI; send null to clear"
 *     responses:
 *       200:
 *         description: Updated profile
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 */
router.patch(
  "/me",
  authMiddleware,
  [
    body("profileImage")
      .optional({ nullable: true })
      .custom((value) => value === null || typeof value === "string")
      .withMessage("profileImage must be a string or null")
      .bail()
      .custom((value) => value === null || String(value).length <= 5000)
      .withMessage("profileImage is too long"),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: "Validation error", errors: normalizeValidationErrors(errors.array()) });
    }

    try {
      if (Object.prototype.hasOwnProperty.call(req.body ?? {}, "profileImage")) {
        req.user.profileImage = req.body.profileImage;
      }

      await req.user.save();
      return getMe(req, res);
    } catch (err) {
      return res.status(500).json({ message: "Server error" });
    }
  }
);

/**
 * @swagger
 * /api/auth/me/profile-image:
 *   post:
 *     summary: Upload profile image (binary multipart)
 *     tags: [Auth]
 *     description: "Uploads an image file to Cloudinary and saves the resulting URL on the authenticated user/staff profile."
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [file]
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Updated profile (same payload as GET /api/auth/me)
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       501:
 *         description: Cloudinary not configured
 *       500:
 *         description: Server error
 */
router.post("/me/profile-image", authMiddleware, upload.single("file"), async (req, res) => {
  try {
    ensureCloudinaryConfigured();

    if (!req.file?.buffer) {
      return res.status(400).json({
        message: "Validation error",
        errors: [{ msg: "file is required", path: "file" }],
      });
    }

    const folder = process.env.CLOUDINARY_FOLDER || "storetrack/profile-images";
    const publicId = `${req.userType}_${req.user._id}`;

    // Load the full doc including the existing public id (if any)
    const Model = req.userType === "staff" ? Staff : User;
    const doc = await Model.findById(req.user._id).select("+profileImagePublicId");
    if (!doc) return res.status(401).json({ message: "Account not found" });

    // If we previously had a Cloudinary public id, delete the old asset (best-effort)
    if (doc.profileImagePublicId) {
      try {
        await cloudinary.uploader.destroy(doc.profileImagePublicId, { resource_type: "image" });
      } catch {
        // ignore
      }
    }

    const result = await uploadBufferToCloudinary({
      buffer: req.file.buffer,
      mimetype: req.file.mimetype,
      folder,
      publicId,
    });

    doc.profileImage = result.secure_url;
    doc.profileImagePublicId = result.public_id;
    await doc.save();

    // Refresh req.user so /me returns updated fields
    req.user.profileImage = doc.profileImage;
    return getMe(req, res);
  } catch (err) {
    const status = Number(err?.status || 500);
    if (status === 501) {
      return res.status(501).json({ message: err.message, code: err.code });
    }

    // Multer fileFilter uses Error which ends up here
    if (String(err?.message || "").includes("Only image uploads")) {
      return res.status(400).json({
        message: "Validation error",
        errors: [{ msg: err.message, path: "file" }],
      });
    }

    return res.status(500).json({ message: "Server error" });
  }
});

/**
 * @swagger
 * /api/auth/me/profile-image:
 *   put:
 *     summary: Persist a direct-to-Cloudinary uploaded profile image
 *     tags: [Auth]
 *     description: "Use after uploading directly to Cloudinary using a signed upload. The server verifies the asset and saves profileImage + profileImagePublicId."
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [profileImagePublicId]
 *             properties:
 *               profileImagePublicId:
 *                 type: string
 *                 description: "Cloudinary public_id returned by the upload (typically includes folder path)"
 *                 example: "storetrack/profile-images/user_65fae1c9d4..."
 *     responses:
 *       200:
 *         description: Updated profile (same payload as GET /api/auth/me)
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       501:
 *         description: Cloudinary not configured
 *       500:
 *         description: Server error
 */
router.put("/me/profile-image", authMiddleware, async (req, res) => {
  try {
    ensureCloudinaryConfigured();

    const candidatePublicId = req.body?.profileImagePublicId || req.body?.publicId;
    if (!candidatePublicId) {
      return res.status(400).json({
        message: "Validation error",
        errors: [{ msg: "profileImagePublicId is required", path: "profileImagePublicId" }],
      });
    }

    const folder = process.env.CLOUDINARY_FOLDER || "storetrack/profile-images";
    const expectedLeafPublicId = `${req.userType}_${req.user._id}`;
    const expectedFullPublicId = `${folder}/${expectedLeafPublicId}`;

    let normalizedPublicId = null;
    if (candidatePublicId === expectedLeafPublicId) {
      normalizedPublicId = expectedFullPublicId;
    } else if (candidatePublicId === expectedFullPublicId) {
      normalizedPublicId = candidatePublicId;
    } else {
      return res.status(400).json({
        message: "Validation error",
        errors: [{ msg: "publicId does not match authenticated account", path: "profileImagePublicId" }],
      });
    }

    let resource;
    try {
      resource = await cloudinary.api.resource(normalizedPublicId, { resource_type: "image" });
    } catch {
      return res.status(400).json({
        message: "Validation error",
        errors: [{ msg: "Cloudinary asset not found", path: "profileImagePublicId" }],
      });
    }

    const Model = req.userType === "staff" ? Staff : User;
    const doc = await Model.findById(req.user._id).select("+profileImagePublicId");
    if (!doc) return res.status(401).json({ message: "Account not found" });

    if (doc.profileImagePublicId && doc.profileImagePublicId !== normalizedPublicId) {
      try {
        await cloudinary.uploader.destroy(doc.profileImagePublicId, { resource_type: "image" });
      } catch {
        // ignore
      }
    }

    doc.profileImage = resource.secure_url;
    doc.profileImagePublicId = normalizedPublicId;
    await doc.save();

    req.user.profileImage = doc.profileImage;
    return getMe(req, res);
  } catch (err) {
    const status = Number(err?.status || 500);
    if (status === 501) {
      return res.status(501).json({ message: err.message, code: err.code });
    }
    return res.status(500).json({ message: "Server error" });
  }
});

/**
 * @swagger
 * /api/auth/me/profile-image:
 *   delete:
 *     summary: Remove profile image
 *     tags: [Auth]
 *     description: "Clears profileImage and deletes the Cloudinary asset if it exists (best-effort)."
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Updated profile (same payload as GET /api/auth/me)
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
router.delete("/me/profile-image", authMiddleware, async (req, res) => {
  try {
    const Model = req.userType === "staff" ? Staff : User;
    const doc = await Model.findById(req.user._id).select("+profileImagePublicId");
    if (!doc) return res.status(401).json({ message: "Account not found" });

    if (doc.profileImagePublicId) {
      try {
        ensureCloudinaryConfigured();
        await cloudinary.uploader.destroy(doc.profileImagePublicId, { resource_type: "image" });
      } catch {
        // ignore
      }
    }

    doc.profileImage = null;
    doc.profileImagePublicId = null;
    await doc.save();

    req.user.profileImage = null;
    return getMe(req, res);
  } catch {
    return res.status(500).json({ message: "Server error" });
  }
});



module.exports = router;