const mongoose = require("mongoose");

const productSchema = new mongoose.Schema({
  name: { type: String, required: true },
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

module.exports = mongoose.model("Product", productSchema);



