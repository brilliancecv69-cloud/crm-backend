const mongoose = require("mongoose");

const expenseSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
      index: true,
    },
    title: { type: String, required: true, trim: true },
    amount: { type: Number, required: true, min: 0 },
    category: { type: String, trim: true }, // مثال: Marketing, Travel, Misc
    date: { type: Date, default: Date.now },
    notes: { type: String, trim: true },
  },
  { timestamps: true }
);

// ممكن نعمل index إضافي لتحسين البحث
expenseSchema.index({ tenantId: 1, date: -1 });

module.exports = mongoose.model("Expense", expenseSchema);
