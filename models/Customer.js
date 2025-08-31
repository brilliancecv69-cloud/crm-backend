// backend/models/Customer.js
const mongoose = require("mongoose");

function normalizePhone(v) {
  if (!v) return v;
  let s = String(v);
  s = s.replace(/\D+/g, "");
  if (s.startsWith("00")) s = s.slice(2);
  if (s.startsWith("0") && s.length === 11) s = "20" + s.slice(1);
  if (s.startsWith("+")) s = s.slice(1);
  return s;
}

const HistoryEntrySchema = new mongoose.Schema({
  by: { type: String, default: "system" },    // who made the change (email or userId)
  from: { type: String, default: null },      // previous status/value
  to: { type: String, default: null },        // new status/value
  date: { type: Date, default: Date.now },
  note: { type: String, default: null }
}, { _id: false });

const customerSchema = new mongoose.Schema({
  clientId: { type: mongoose.Schema.Types.ObjectId, ref: "Client", default: null, index: true },

  phone: { type: String, required: true, trim: true, set: normalizePhone, index: true },
  name: { type: String, default: "", trim: true },
  email: { type: String, default: "", trim: true },
  address: { type: String, default: "", trim: true },
  notes: { type: String, default: "" },

  // يحدد مكان الظهور: الافتراضي "customer" لأن ده كولكشن العملاء
  status: { type: String, default: "customer", index: true },

  // link back to original lead (if converted from a lead)
  fromLeadId: { type: mongoose.Schema.Types.ObjectId, ref: "Lead", default: null, index: true },

  // new fields
  whatsappFirstSeen: { type: Date, default: null }, // first time this contact seen in WhatsApp
  lastContacted: { type: Date, default: null },     // manual last contact date

  last_seen: { type: Date, default: Date.now },

  // Soft-archive / sales fields (added)
  archived: { type: Boolean, default: false, index: true }, // if true, do not show in active customers list
  soldAt: { type: Date, default: null },
  soldBy: { type: String, default: null },

  // history log of changes (status changes, important edits)
  history: { type: [HistoryEntrySchema], default: [] }

}, { timestamps: true });

// Unique per client على الهاتف (تجنّب الدوبليكيت)
customerSchema.index({ clientId: 1, phone: 1 }, { unique: true, sparse: true });

// method صغيرة لسهولة تسجيل تاريخ التغيير
customerSchema.methods.pushHistory = function ({ by = "system", from = null, to = null, note = null } = {}) {
  this.history.push({ by, from, to, note, date: new Date() });
};

module.exports = mongoose.model("Customer", customerSchema);
