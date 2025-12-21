

/**
 * Get currently authenticated user (admin / manager / staff)
 * Uses authMiddleware to already resolve the user
 */
exports.getMe = async (req, res) => {
    const user = req.user;

    res.status(200).json({
        id: user._id,
        name: user.name,
        email: user.email || null,
        role: user.role,
        userType: req.userType, // "user" | "staff"
        profileImage: user.profileImage || null,
        storeId: req.storeId || null,
        store: user.store || null,
    });
};
