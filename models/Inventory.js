const mongoose = require("mongoose");

const inventorySchema = new mongoose.Schema({
  product: String,
  quantity: Number,
  price: Number,
  store: String, // store ID
});

module.exports = mongoose.model("Inventory", inventorySchema);