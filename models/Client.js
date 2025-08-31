const mongoose = require("mongoose");

const featuresSchema = new mongoose.Schema({
  ads: { type: Boolean, default: false },
  sales: { type: Boolean, default: false },
  installments: { type: Boolean, default: false },
}, { _id: false });

const clientSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, unique: true, required: true, lowercase: true, trim: true },
  password: { type: String, required: true },
  features: { type: featuresSchema, default: () => ({}) },
}, { timestamps: true });

module.exports = mongoose.model("Client", clientSchema);
