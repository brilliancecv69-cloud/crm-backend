const mongoose = require("mongoose");

const productSchema = new mongoose.Schema({
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Tenant",
    required: true,
    index: true,
  },
  name: { type: String, required: true },
  sku: { type: String, required: true, trim: true }, // كود المنتج
  category: { type: String },
  price: { type: Number, required: true },
  stockQty: { type: Number, default: 0 },   // الكمية الحالية
  minQty: { type: Number, default: 0 },     // أقل كمية قبل الإنذار
  notes: { type: String },

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// ✅ Unique per tenant على الـ SKU
productSchema.index({ tenantId: 1, sku: 1 }, { unique: true });

// تحديث الـ updatedAt تلقائيًا
productSchema.pre("save", function (next) {
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.model("Product", productSchema);
