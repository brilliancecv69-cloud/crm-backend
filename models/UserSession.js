const mongoose = require("mongoose");

const userSessionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true,
    index: true,
  },
  loginTime: {
    type: Date,
    required: true,
  },
  logoutTime: {
    type: Date,
  },
  duration: { // in seconds
    type: Number, 
    default: 0,
  },

  // --- ✅ جديد ---
  lastActionAt: { // آخر مرة اليوزر عمل أي request / activity
    type: Date,
    default: Date.now,
  },
  isIdle: { // هل اليوزر سايب السيستم من غير أي حركة
    type: Boolean,
    default: false,
  },
  firstLogin: { // optional: أول login ever (بنخزنه عشان نبينه للأدمين)
    type: Date,
  },
}, { timestamps: true });

module.exports = mongoose.model("UserSession", userSessionSchema);
