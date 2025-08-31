// backend/models/Sale.js
const mongoose = require("mongoose");

const STATUS = ["new", "contacted", "qualified", "proposal", "won", "lost"];

const SaleSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },

    // روابط الهوية — أبقيت القديم وأضافت clientId لمرونة مستقبلية
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: "Customer", index: true },
    clientId:   { type: mongoose.Schema.Types.ObjectId, ref: "Client", index: true }, // اختياري للاعتماد المباشر على Client
    customer:   { type: String, required: true, trim: true }, // اسم معروض

    amount: { type: Number, default: 0, min: 0 },

    status: { type: String, enum: STATUS, default: "new", index: true },

    owner: { type: String, trim: true, index: true },

    expectedClose: { type: Date },

    notes: { type: String, trim: true },
  },
  { timestamps: true }
);

// 🟢 Indexes للبحث و الفرز
SaleSchema.index({ title: "text", customer: "text", notes: "text" });

module.exports = mongoose.model("Sale", SaleSchema);
