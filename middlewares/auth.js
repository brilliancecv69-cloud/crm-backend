const jwt = require("jsonwebtoken");
const Tenant = require("../models/Tenant");
const User = require("../models/User");
const UserSession = require("../models/UserSession"); // ✅ نضيف الموديل

module.exports = async (req, res, next) => { 
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ ok: false, error: "No token, authorization denied" });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);

    // ✅ التحقق من التينانت
    const tenant = await Tenant.findById(payload.tenantId);
    if (!tenant || !tenant.isActive) {
      return res.status(403).json({ ok: false, error: "Access denied. Account is suspended or does not exist." });
    }

    // ✅ جلب بيانات المستخدم
    const user = await User.findById(payload.id).select("name email role tenantId");
    if (!user) {
      return res.status(401).json({ ok: false, error: "User not found" });
    }

    req.user = { 
      id: user._id, 
      role: user.role, 
      tenantId: user.tenantId, 
      name: user.name, 
      email: user.email
    };

    // --- ✅ تحديث النشاط (lastActionAt) ---
    try {
      await UserSession.findOneAndUpdate(
        { userId: user._id, logoutTime: null }, // session المفتوح الحالي
        { lastActionAt: new Date(), isIdle: false }, // رجعه Active
        { new: true }
      );
    } catch (updateErr) {
      console.warn("⚠️ Failed to update lastActionAt:", updateErr.message);
    }

    next();
  } catch (err) {
    return res.status(401).json({ ok: false, error: "Invalid or expired token" });
  }
};
