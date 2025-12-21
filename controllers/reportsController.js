const Sale = require("../models/Sale");
const Product = require("../models/Product");
const Staff = require("../models/Staff");

/**
 * Get total sales grouped by staff
 */
exports.getSalesByStaff = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const match = { store: req.storeId };

    if (startDate || endDate) {
      match.createdAt = {};
      if (startDate) match.createdAt.$gte = new Date(startDate);
      if (endDate) match.createdAt.$lte = new Date(endDate);
    }

    const report = await Sale.aggregate([
      { $match: match },
      {
        $group: {
          _id: "$staff",
          totalSales: { $sum: "$totalPrice" },
          totalQuantity: { $sum: "$quantity" },
        },
      },
      {
        $lookup: {
          from: "staffs",
          localField: "_id",
          foreignField: "_id",
          as: "staff",
        },
      },
      { $unwind: "$staff" },
      {
        $project: {
          _id: 0,
          staffId: "$staff._id",
          staffName: "$staff.name",
          totalSales: 1,
          totalQuantity: 1,
        },
      },
    ]);

    res.json(report);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/**
 * Get total sales value
 */
exports.getTotalSales = async (req, res) => {
  try {
    const result = await Sale.aggregate([
      { $match: { store: req.storeId } },
      {
        $group: {
          _id: null,
          totalSales: { $sum: "$totalPrice" },
          totalRevenue: { $sum: "$totalPrice" },
          totalTransactions: { $sum: 1 },
        },
      },
    ]);

    res.json({
      totalSales: result[0]?.totalSales || 0,
      totalRevenue: result[0]?.totalRevenue || 0,
      totalTransactions: result[0]?.totalTransactions || 0,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/**
 * Get low stock products
 */
exports.getLowStock = async (req, res) => {
  try {
    const products = await Product.find({
      store: req.storeId,
      $expr: { $lte: ["$quantity", "$lowStockThreshold"] },
    }).sort({ quantity: 1 });

    res.json(products);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/**
 * Get total revenue, profit, and margin
 */
exports.getProfit = async (req, res) => {
  try {
    const result = await Sale.aggregate([
      { $match: { store: req.storeId } },

      {
        $lookup: {
          from: "products",
          localField: "product",
          foreignField: "_id",
          as: "product",
        },
      },
      { $unwind: "$product" },

      {
        $addFields: {
          unitCostPrice: { $ifNull: ["$unitCostPrice", "$product.costPrice"] },
          profit: {
            $subtract: [
              "$totalPrice",
              { $multiply: [{ $ifNull: ["$unitCostPrice", "$product.costPrice"] }, "$quantity"] },
            ],
          },
        },
      },

      {
        $group: {
          _id: null,
          revenue: { $sum: "$totalPrice" },
          cost: { $sum: { $multiply: ["$unitCostPrice", "$quantity"] } },
          profit: { $sum: "$profit" },
        },
      },
    ]);

    const revenue = result[0]?.revenue || 0;
    const cost = result[0]?.cost || 0;
    const profit = result[0]?.profit || 0;
    const margin = revenue > 0 ? ((profit / revenue) * 100).toFixed(2) : "0.00";

    res.json({ revenue, cost, profit, margin });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/**
 * Get profit per product
 */
exports.getProfitByProduct = async (req, res) => {
  try {
    const report = await Sale.aggregate([
      { $match: { store: req.storeId } },

      // Use product lookup for legacy sales without snapshots
      {
        $lookup: {
          from: "products",
          localField: "product",
          foreignField: "_id",
          as: "product",
        },
      },
      { $unwind: "$product" },

      {
        $addFields: {
          unitCostPrice: { $ifNull: ["$unitCostPrice", "$product.costPrice"] },
          profit: {
            $subtract: [
              "$totalPrice",
              { $multiply: [{ $ifNull: ["$unitCostPrice", "$product.costPrice"] }, "$quantity"] },
            ],
          },
        },
      },

      {
        $group: {
          _id: "$product._id",
          productName: { $first: "$product.name" },
          revenue: { $sum: "$totalPrice" },
          profit: { $sum: "$profit" },
        },
      },

      {
        $project: {
          _id: 0,
          productId: "$_id",
          productName: 1,
          revenue: 1,
          profit: 1,
        },
      },
    ]);

    res.json(report);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/**
 * Get profit per staff
 */
exports.getProfitByStaff = async (req, res) => {
  try {
    const data = await Sale.aggregate([
      { $match: { store: req.storeId } },

      {
        $lookup: {
          from: "products",
          localField: "product",
          foreignField: "_id",
          as: "product",
        },
      },
      { $unwind: "$product" },

      {
        $addFields: {
          unitCostPrice: { $ifNull: ["$unitCostPrice", "$product.costPrice"] },
          profit: {
            $subtract: [
              "$totalPrice",
              { $multiply: [{ $ifNull: ["$unitCostPrice", "$product.costPrice"] }, "$quantity"] },
            ],
          },
        },
      },

      {
        $group: {
          _id: "$staff",
          totalProfit: { $sum: "$profit" },
          totalSalesAmount: { $sum: "$totalPrice" },
          totalItemsSold: { $sum: "$quantity" },
        },
      },

      {
        $lookup: {
          from: "staffs",
          localField: "_id",
          foreignField: "_id",
          as: "staff",
        },
      },
      { $unwind: "$staff" },

      {
        $project: {
          _id: 0,
          staffId: "$staff._id",
          staffName: "$staff.name",
          totalProfit: 1,
          totalSalesAmount: 1,
          totalItemsSold: 1,
        },
      },
    ]);

    res.json(data);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};