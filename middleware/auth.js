const jwt = require("jsonwebtoken");
const User = require("../models/User");

/**
 * Protect routes and attach user info
 * Only validates access token
 */
const authMiddleware = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "No token provided" });
  }

  const token = authHeader.split(" ")[1];

  try {
    // Verify access token
    const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);

    // Fetch user from DB, exclude sensitive info
    const user = await User.findById(decoded.id).select("-password -refreshToken");
    if (!user) {
      return res.status(401).json({ message: "User not found" });
    }

    // Attach user info to request object
    req.user = user;

    next();
  } catch (err) {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
};

/**
 * Optionally restrict access to a specific store or resource
 * @param {string} param - the request param to check (default "storeId")
 */
const storeOwnerMiddleware = (param = "storeId") => {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });

    const userStoreId = req.user.store?.toString();
    const requestedStoreId = req.params[param];

    if (requestedStoreId && requestedStoreId !== userStoreId) {
      return res.status(403).json({ message: "Forbidden: Access denied to this store/resource" });
    }

    next();
  };
};

module.exports = {
  authMiddleware,
  storeOwnerMiddleware,
};

