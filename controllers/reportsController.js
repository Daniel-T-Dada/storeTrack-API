const Sale = require("../models/Sale");
const Product = require("../models/Product");

/**
 * GET /api/reports/sales-by-staff
 */
exports.getSalesByStaff = async (req, res) => {
  try {
    const data = await Sale.aggregate([
      { $match: { store: req.user._id } },
      {
        $group: {
          _id: "$staff",
          totalSales: { $sum: "$totalPrice" },
          totalQuantity: { $sum: "$quantity" },
        },
      },
    ]);

    res.json(data);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/**
 * GET /api/reports/total-sales
 */
exports.getTotalSales = async (req, res) => {
  try {
    const result = await Sale.aggregate([
      { $match: { store: req.user._id } },
      { $group: { _id: null, totalSales: { $sum: "$totalPrice" } } },
    ]);

    res.json({ totalSales: result[0]?.totalSales || 0 });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/**
 * GET /api/reports/low-stock
 */
exports.getLowStock = async (req, res) => {
  try {
    const products = await Product.find({
      store: req.user._id,
      $expr: { $lte: ["$quantity", "$lowStockThreshold"] },
    }).sort({ quantity: 1 });

    res.json(products);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/**
 * GET /api/reports/profit
 */
exports.getProfit = async (req, res) => {
  try {
    const result = await Sale.aggregate([
      { $match: { store: req.user._id } },
      {
        $group: {
          _id: null,
          revenue: { $sum: "$totalPrice" },
          profit: { $sum: "$profit" },
        },
      },
    ]);

    const revenue = result[0]?.revenue || 0;
    const profit = result[0]?.profit || 0;
    const margin = revenue ? ((profit / revenue) * 100).toFixed(2) : 0;

    res.json({ revenue, profit, margin });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/**
 * GET /api/reports/profit-by-product
 */
exports.getProfitByProduct = async (req, res) => {
  try {
    const data = await Sale.aggregate([
      { $match: { store: req.user._id } },
      {
        $group: {
          _id: "$product",
          revenue: { $sum: "$totalPrice" },
          profit: { $sum: "$profit" },
        },
      },
    ]);

    res.json(data);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/**
 * GET /api/reports/profit-by-staff
 */
exports.getProfitByStaff = async (req, res) => {
  try {
    const data = await Sale.aggregate([
      { $match: { store: req.user._id } },
      {
        $group: {
          _id: "$staff",
          totalProfit: { $sum: "$profit" },
          totalSalesAmount: { $sum: "$totalPrice" },
        },
      },
    ]);

    res.json(data);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};