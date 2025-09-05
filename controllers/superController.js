const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const Tenant = require("../models/Tenant");
const User = require("../models/User");

// ثابت مؤقت (تقدر تحطه في .env)
const SUPER_EMAIL = process.env.SUPER_EMAIL || "super@crm.com";
const SUPER_PASS = process.env.SUPER_PASS || "123456";

// helper generate token
function generateTokenSuper(payload) {
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: "7d" });
}

// 🔑 Super Admin login
exports.login = async (req, res) => {
  const { email, password } = req.body;
  if (email !== SUPER_EMAIL || password !== SUPER_PASS) {
    return res.status(401).json({ ok: false, error: "Invalid super credentials" });
  }
  const token = generateTokenSuper({ role: "super" });
  res.json({ ok: true, data: { token } });
};

// 🏢 Tenants
exports.listTenants = async (req, res) => {
  const tenants = await Tenant.find().sort({ createdAt: -1 });
  res.json({ ok: true, data: tenants });
};

exports.createTenant = async (req, res) => {
  try {
    const { name, slug } = req.body;
    const tenant = await Tenant.create({ name, slug });
    res.status(201).json({ ok: true, data: tenant });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
};

// 👥 Users
exports.listUsers = async (req, res) => {
  const users = await User.find().populate("tenantId", "name");
  res.json({ ok: true, data: users });
};

// superController.js

exports.createUser = async (req, res) => {
  try {
    const { name, email, password, role, tenantId } = req.body;

    // سيب الـ pre-save hook يـhash
    const user = await User.create({
      name,
      email,
      password, // مش متـhash هنا
      role,
      tenantId,
    });

    res.status(201).json({
      ok: true,
      data: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        tenantId: user.tenantId,
      },
    });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
};

