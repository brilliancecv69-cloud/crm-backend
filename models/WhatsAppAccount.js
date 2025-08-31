// backend/models/WhatsAppAccount.js
const mongoose = require("mongoose");

const whatsappAccountSchema = new mongoose.Schema({
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Tenant",
    required: true,
    unique: true, // 🟢 شركة واحدة = سيشن واحد
  },
  phone: { type: String, required: false }, // يتسجل بعد أول اتصال ناجح
  sessionName: { type: String, required: true, unique: true }, // ex: "tenant-<slug>"
  isActive: { type: Boolean, default: true },
  lastConnected: { type: Date },
}, { timestamps: true });

module.exports = mongoose.model("WhatsAppAccount", whatsappAccountSchema);
