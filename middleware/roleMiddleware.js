

/**
 * roleMiddleware.js
 * Restrict access based on user roles
 */

const roleMiddleware = (allowedRoles = []) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ message: "Unauthorized" });
        }

        // Check if the user's role is in the allowed list
        if (!allowedRoles.includes(req.user.role)) {
            return res.status(403).json({ message: "Forbidden: Access denied for your role" });
        }

        next();
    };
};

module.exports = roleMiddleware;
