// backend/models/Status.js
const mongoose = require("mongoose");

const statusSchema = new mongoose.Schema({
  key: { type: String, required: true, trim: true },
  label: { type: String, required: true, trim: true },
  order: { type: Number, default: 0 },
  clientId: { type: mongoose.Schema.Types.ObjectId, ref: "Client", default: null },
}, { timestamps: true });

statusSchema.index({ clientId: 1, key: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model("Status", statusSchema);
