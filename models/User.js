const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: [true, "Password is required"],
      minlength: 6,
      select: false, // 🚨 ما يرجعش الباسورد في الـ queries
    },
    role: {
      type: String,
      enum: ["admin", "sales"], // 🎯 بس الاتنين دول مبدئياً
      default: "sales",
    },
    // --- ✅ بداية الإضافة الجديدة ✅ ---
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    // --- 🔚 نهاية الإضافة الجديدة 🔚 ---
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      required: true, // 🎯 كل يوزر لازم يتبع Tenant
      index: true,
    },
  },
  { timestamps: true }
);

// 🔐 Hash password before save
userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// 📌 Helper: compare passwords
userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};
// 📌 Helper: update password safely
userSchema.methods.setPassword = async function (newPassword) {
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(newPassword, salt);
  return this.save();
};

module.exports = mongoose.model("User", userSchema);