const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const Joi = require("joi");
const User = require("../models/User");
const Tenant = require("../models/Tenant"); // ✅ موديل الشركة
const asyncHandler = require("../middlewares/asyncHandler");

const registerSchema = Joi.object({
  name: Joi.string().min(2).required(),
  email: Joi.string().email().required(),
  password: Joi.string().min(6).required(),
  role: Joi.string().valid("admin", "sales").default("sales"),
  tenantId: Joi.string().required(),
});

const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required(),
});

// ✅ تعديل generateToken علشان يخزن tenantId كـ string مش object
const generateToken = (user) =>
  jwt.sign(
    { 
      id: user._id, 
      role: user.role, 
      tenantId: user.tenantId._id ? user.tenantId._id.toString() : user.tenantId.toString() 
    },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );

// ⬇️ Register
exports.register = asyncHandler(async (req, res) => {
  const data = await registerSchema.validateAsync(req.body);

  const exists = await User.findOne({ email: data.email });
  if (exists) return res.status(400).json({ ok: false, error: "Email already in use" });

  const user = await User.create(data);

  res.status(201).json({
    ok: true,
    data: {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      tenantId: user.tenantId,
      token: generateToken(user),
    },
  });
});

// ⬇️ Login
exports.login = asyncHandler(async (req, res) => {
  const { email, password } = await loginSchema.validateAsync(req.body);

  const user = await User.findOne({ email }).select("+password").populate("tenantId");
  if (!user) {
    return res.status(401).json({ ok: false, error: "Invalid credentials" });
  }

  if (!user.isActive) {
    return res.status(403).json({ ok: false, error: "Your account is disabled. Please contact your administrator." });
  }

  if (!user.tenantId || !user.tenantId.isActive) {
    return res.status(403).json({ ok: false, error: "Your company's account is suspended." });
  }

  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) {
    return res.status(401).json({ ok: false, error: "Invalid credentials" });
  }

  res.json({
    ok: true,
    data: {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      tenantId: user.tenantId._id,
      token: generateToken({ ...user.toObject(), tenantId: user.tenantId._id }), // 🟢 هنا بنمرر ID فقط
    },
  });
});

// ⬇️ Get Profile
exports.me = asyncHandler(async (req, res) => {
  if (!req.user?.id) return res.status(401).json({ ok: false, error: "Unauthorized" });

  const user = await User.findById(req.user.id).select("_id name email role tenantId createdAt");
  if (!user) return res.status(404).json({ ok: false, error: "User not found" });

  res.json({ ok: true, data: user });
});

// ⬇️ Reset Password
exports.resetPassword = asyncHandler(async (req, res) => {
  if (req.user.role !== "admin" && req.user.role !== "super") {
    return res.status(403).json({ ok: false, error: "Forbidden" });
  }

  const { newPassword } = req.body;
  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({ ok: false, error: "Password must be at least 6 chars" });
  }

  const user = await User.findById(req.params.id).select("+password");
  if (!user) return res.status(404).json({ ok: false, error: "User not found" });

  await user.setPassword(newPassword);

  res.json({ ok: true, data: { message: "Password updated successfully" } });
});
