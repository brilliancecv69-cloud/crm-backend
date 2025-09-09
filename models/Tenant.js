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
      // --- ✅ START: NEW FIELDS ADDED ---
      price: {
        type: Number,
        default: 0,
      }, // سعر الاشتراك
      paidAmount: {
        type: Number,
        default: 0,
      }, // المبلغ المدفوع
      // --- ✅ END: NEW FIELDS ADDED ---
    },

    settings: {
      leadDistributionStrategy: {
        type: String,
        enum: ['manual', 'round-robin'],
        default: 'manual',
      },
      leadCounter: { type: Number, default: 0 },
    },
  },
  { 
    timestamps: true,
    // To include virtuals in the output
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// --- ✅ START: NEW VIRTUAL PROPERTY ---
// حقل افتراضي لحساب المبلغ المتبقي تلقائياً
tenantSchema.virtual('subscription.remainingAmount').get(function() {
  if (this.subscription && typeof this.subscription.price === 'number' && typeof this.subscription.paidAmount === 'number') {
    return this.subscription.price - this.subscription.paidAmount;
  }
  return 0; // Or null, depending on how you want to handle it
});
// --- ✅ END: NEW VIRTUAL PROPERTY ---

module.exports = mongoose.model("Tenant", tenantSchema);