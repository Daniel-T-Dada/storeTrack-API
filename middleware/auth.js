const jwt = require("jsonwebtoken");
const User = require("../models/User");
const Staff = require("../models/Staff");

/**
 * Protect routes and attach authenticated entity
 * Supports admin, manager, and staff
 */
const authMiddleware = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  let token = null;

  if (authHeader?.startsWith("Bearer ")) {
    token = authHeader.split(" ")[1];
  } else if (req.cookies?.accessToken) {
    token = req.cookies.accessToken;
  }

  if (!token) {
    return res.status(401).json({ message: "No token provided" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);

    // Prefer deterministic typing when token includes it
    if (decoded.typ === "user") {
      const user = await User.findById(decoded.id).select("-password -refreshToken");
      if (!user) return res.status(401).json({ message: "Account not found" });
      req.user = user;
      req.userType = "user";
      req.storeId = user._id;
      return next();
    }

    if (decoded.typ === "staff") {
      const staff = await Staff.findById(decoded.id).select("-password");
      if (!staff) return res.status(401).json({ message: "Account not found" });
      req.user = staff;
      req.userType = "staff";
      req.storeId = staff.store;
      return next();
    }

    // Backward-compatible fallback for older tokens without `typ`
    let account = await User.findById(decoded.id).select("-password -refreshToken");
    if (account) {
      req.user = account;
      req.userType = "user";
      req.storeId = account._id;
      return next();
    }

    account = await Staff.findById(decoded.id).select("-password");
    if (!account) return res.status(401).json({ message: "Account not found" });
    req.user = account;
    req.userType = "staff";
    req.storeId = account.store;

    next();
  } catch {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
};

/**
 * Role-based authorization
 */
const authorizeRoles = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ message: "Forbidden: insufficient permissions" });
    }
    next();
  };
};

/**
 * Restrict access to a store (admin / manager only)
 */
const storeOwnerMiddleware = (param = "storeId") => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (req.user.role === "staff") {
      return res.status(403).json({ message: "Staff cannot access this resource" });
    }

    const userStoreId = req.storeId?.toString?.();
    const requestedStoreId = req.params[param];

    if (requestedStoreId && requestedStoreId !== userStoreId) {
      return res
        .status(403)
        .json({ message: "Forbidden: Access denied to this store/resource" });
    }

    next();
  };
};

module.exports = {
  authMiddleware,
  authorizeRoles,
  storeOwnerMiddleware,
};
