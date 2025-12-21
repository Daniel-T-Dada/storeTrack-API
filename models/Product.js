const mongoose = require("mongoose");

const productSchema = new mongoose.Schema({
  name: { type: String, required: true },
  sku: {
    type: String,
    trim: true,
  },
  barcode: {
    type: String,
    trim: true,
  },
  price: { type: Number, required: true },
  costPrice: {
    type: Number,
    required: true,
  },
  quantity: { type: Number, required: true },
  lowStockThreshold: {
    type: Number,
    default: 5, // sensible default
  },
  isLowStock: {
    type: Boolean,
    default: false,
  },
  description: { type: String },
  store: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }, // <-- store owner
  createdAt: { type: Date, default: Date.now },
});

// Unique per store (optional fields)
productSchema.index(
  { store: 1, sku: 1 },
  {
    unique: true,
    partialFilterExpression: {
      sku: { $type: "string", $ne: "" },
    },
  }
);

productSchema.index(
  { store: 1, barcode: 1 },
  {
    unique: true,
    partialFilterExpression: {
      barcode: { $type: "string", $ne: "" },
    },
  }
);

module.exports = mongoose.model("Product", productSchema);



