const express = require("express");
const router = express.Router();
const { authMiddleware } = require("../middleware/auth");
const { cloudinary, ensureCloudinaryConfigured } = require("../config/cloudinary");

/**
 * @swagger
 * tags:
 *   - name: Uploads
 *     description: Signed upload helpers (direct-to-cloud)
 */

/**
 * @swagger
 * /api/uploads/cloudinary-signature:
 *   post:
 *     summary: Get Cloudinary signed upload params (direct-to-cloud)
 *     tags: [Uploads]
 *     description: "Use this to upload directly from the frontend to Cloudinary without buffering through the API. Requires auth."
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Signed upload params
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 cloudName:
 *                   type: string
 *                   example: "demo"
 *                 apiKey:
 *                   type: string
 *                   example: "1234567890"
 *                 timestamp:
 *                   type: number
 *                   example: 1730000000
 *                 signature:
 *                   type: string
 *                   example: "abcdef0123456789..."
 *                 folder:
 *                   type: string
 *                   example: "storetrack/profile-images"
 *                 publicId:
 *                   type: string
 *                   example: "user_65fae1c9d4..."
 *       401:
 *         description: Unauthorized
 *       501:
 *         description: Cloudinary not configured
 *       500:
 *         description: Server error
 */
router.post("/cloudinary-signature", authMiddleware, (req, res) => {
    try {
        ensureCloudinaryConfigured();

        const folder = process.env.CLOUDINARY_FOLDER || "storetrack/profile-images";
        const publicId = `${req.userType}_${req.user._id}`;
        const timestamp = Math.floor(Date.now() / 1000);

        const paramsToSign = {
            timestamp,
            folder,
            public_id: publicId,
        };

        const signature = cloudinary.utils.api_sign_request(paramsToSign, process.env.CLOUDINARY_API_SECRET);

        return res.json({
            cloudName: process.env.CLOUDINARY_CLOUD_NAME,
            apiKey: process.env.CLOUDINARY_API_KEY,
            timestamp,
            signature,
            folder,
            publicId,
        });
    } catch (err) {
        const status = Number(err?.status || 500);
        if (status === 501) {
            return res.status(501).json({ message: err.message, code: err.code });
        }
        return res.status(500).json({ message: "Server error" });
    }
});

module.exports = router;
