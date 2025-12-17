const mongoose = require("mongoose");

const staffSchema = new mongoose.Schema({
  name: { type: String, required: true },
  role: { type: String, required: true },
  store: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }, // Add this
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Staff", staffSchema);
