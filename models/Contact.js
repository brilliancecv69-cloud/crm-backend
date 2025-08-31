const mongoose = require("mongoose");

// helper: normalize phone numbers
function normalizePhone(v) {
  if (!v) return v;
  let s = String(v);
  s = s.replace(/\D+/g, ""); // remove non-digits
  if (s.startsWith("00")) s = s.slice(2);
  if (s.startsWith("+")) s = s.slice(1);
  if (s.startsWith("0") && s.length === 11) {
    // مثال مصر: 0XXXXXXXXXX -> 20XXXXXXXXXX
    s = "20" + s.slice(1);
  }
  return s;
}

const stageEnum = ["lead", "qualified", "customer", "sales"];
const pipelineEnum = ["new", "contacted", "qualified", "proposal", "won", "lost"];

// track stage changes
const stageHistorySchema = new mongoose.Schema(
  {
    from: { type: String },
    to: { type: String },
    at: { type: Date, default: Date.now },
    by: { type: String, default: "system" },
  },
  { _id: false }
);

// subdocument for sales info
const salesDataSchema = new mongoose.Schema(
  {
    pipeline_status: { type: String, enum: pipelineEnum, default: "new", index: true },
    amount: { type: Number, default: 0 },
    probability: { type: Number, min: 0, max: 100, default: 0 },
  },
  { _id: false }
);

// subdocument for products in a sale
const productLineSchema = new mongoose.Schema(
  {
    productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
    qty: { type: Number, required: true },
    price: { type: Number, required: true }, // السعر وقت البيع
  },
  { _id: false }
);

const contactSchema = new mongoose.Schema(
  {
    // 🎯 multi-tenant support
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
      index: true,
    },

    // بيانات أساسية
    name: { type: String, trim: true },
    phone: {
      type: String,
      required: true,
      trim: true,
      set: normalizePhone,
      index: true,
    },
    email: { type: String, lowercase: true, trim: true },
    address: { type: String, trim: true },
    notes: { type: String, trim: true },

    // stage machine
    stage: { type: String, enum: stageEnum, default: "lead", index: true },

    // 🟢 السيلز المسؤول عن العميل
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },

    // sales info
    salesData: { type: salesDataSchema, default: {} },

    // ✅ المنتجات المرتبطة بالصفقة
    products: { type: [productLineSchema], default: [] },

    // activity
    lastContacted: { type: Date, default: null },
    whatsappFirstSeen: { type: Date, default: null },
    last_seen: { type: Date, default: Date.now },

    // flags
    isArchived: { type: Boolean, default: false, index: true },

    // history
    stageHistory: { type: [stageHistorySchema], default: [] },
  },
  { timestamps: true }
);

// ✅ composite unique index (tenantId + phone)
contactSchema.index({ tenantId: 1, phone: 1 }, { unique: true });

module.exports = mongoose.model("Contact", contactSchema);
