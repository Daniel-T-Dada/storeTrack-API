const mongoose = require("mongoose");

const saleSchema = new mongoose.Schema(
  {
    transactionId: {
      type: mongoose.Schema.Types.ObjectId,
      index: true,
    },
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    productNameSnapshot: {
      type: String,
    },
    unitPrice: {
      type: Number,
    },
    unitCostPrice: {
      type: Number,
    },
    staff: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Staff",
      required: false,
    },
    cashierType: {
      type: String,
      enum: ["staff", "user"],
      default: "staff",
    },
    cashierUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    cashierNameSnapshot: {
      type: String,
    },
    quantity: {
      type: Number,
      required: true,
    },
    totalPrice: {
      type: Number,
      required: true,
    },
    store: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true }
);

saleSchema.index({ store: 1, createdAt: -1 });
saleSchema.index({ store: 1, staff: 1, createdAt: -1 });
saleSchema.index({ store: 1, cashierUser: 1, createdAt: -1 });

module.exports = mongoose.model("Sale", saleSchema);