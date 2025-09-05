const mongoose = require("mongoose");

const tenantSchema = new mongoose.Schema(
  {
    name: { type: String, required: true }, // اسم الشركة
    slug: { type: String, required: true, unique: true }, // identifier قصير للشركة (مثلاً tigershr, company1)
    maxUsers: { type: Number, default: 5 }, // الحد الأقصى لعدد الحسابات
    isActive: { type: Boolean, default: true }, // تفعيل/إيقاف الشركة
    
    subscription: {
      type: {
        type: String,
        enum: ["none", "monthly", "yearly", "trial"],
        default: "none",
      },
      status: {
        type: String,
        enum: ["active", "inactive", "expired"],
        default: "inactive",
      },
      expiresAt: {
        type: Date,
        default: null,
      },
    },

    settings: {
      // ⭐️ تمت إضافة هذا الحقل لدعم توزيع العملاء بشكل صحيح
      leadCounter: { type: Number, default: 0 },
      // ... يمكن إضافة أي إعدادات أخرى هنا
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Tenant", tenantSchema);