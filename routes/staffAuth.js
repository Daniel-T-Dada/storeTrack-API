const express = require("express");
const router = express.Router();
const { body, validationResult } = require("express-validator");
const { loginStaff, refreshStaff, logoutStaff } = require("../controllers/staffAuthController");

const normalizeValidationErrors = (errorsResult) =>
    errorsResult.array().map((e) => ({ msg: e.msg, path: e.path || e.param }));

/**
 * @swagger
 * tags:
 *   name: StaffAuth
 *   description: Staff authentication
 */

/**
 * @swagger
 * /api/staff-auth/login:
 *   post:
 *     summary: Login a staff member
 *     tags: [StaffAuth]
 *     description: "On success, returns tokens and sets HttpOnly cookies: accessToken + staffRefreshToken."
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
 *                 example: staff@example.com
 *               password:
 *                 type: string
 *                 example: staffPassword123
 *     responses:
 *       200:
 *         description: Staff login successful (sets cookie)
 *       400:
 *         description: Invalid credentials
 */
router.post(
    "/login",
    [
        body("email").isEmail().withMessage("email must be valid"),
        body("password").isString().notEmpty().withMessage("password is required"),
    ],
    (req, res, next) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ message: "Validation error", errors: normalizeValidationErrors(errors) });
        }
        return loginStaff(req, res, next);
    }
);

/**
 * @swagger
 * /api/staff-auth/refresh:
 *   post:
 *     summary: Refresh staff access token
 *     tags: [StaffAuth]
 *     description: "Send refreshToken in JSON body OR via HttpOnly staffRefreshToken cookie. On success, returns new tokens and re-sets cookies."
 *     security: []
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
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
router.post(
    "/refresh",
    [body("refreshToken").optional().isString().withMessage("refreshToken must be a string")],
    (req, res, next) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ message: "Validation error", errors: normalizeValidationErrors(errors) });
        }
        return refreshStaff(req, res, next);
    }
);

/**
 * @swagger
 * /api/staff-auth/logout:
 *   post:
 *     summary: Logout a staff session
 *     tags: [StaffAuth]
 *     description: "Clears accessToken + staffRefreshToken cookies and revokes refresh token if provided."
 *     security: []
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               refreshToken:
 *                 type: string
 *     responses:
 *       200:
 *         description: Logged out
 */
router.post(
    "/logout",
    [body("refreshToken").optional().isString().withMessage("refreshToken must be a string")],
    (req, res, next) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ message: "Validation error", errors: normalizeValidationErrors(errors) });
        }
        return logoutStaff(req, res, next);
    }
);

module.exports = router;
