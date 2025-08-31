// backend/middlewares/superAuth.js
const jwt = require("jsonwebtoken");

exports.superAuth = (req, res, next) => {
  const auth = req.headers.authorization;

  if (!auth || !auth.startsWith("Bearer ")) {
    console.log("❌ No Authorization header");
    return res.status(401).json({ ok: false, error: "No token" });
  }

  const token = auth.split(" ")[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // 🟢 Debug Log
    console.log("🔑 [superAuth] Token received:", token);
    console.log("📦 [superAuth] Decoded payload:", decoded);

    if (decoded.role !== "super") {
      console.log("🚫 [superAuth] Forbidden, role is:", decoded.role);
      return res.status(403).json({ ok: false, error: "Forbidden" });
    }

    req.super = decoded;
    next();
  } catch (err) {
    console.log("❌ [superAuth] Invalid token:", err.message);
    return res.status(401).json({ ok: false, error: "Invalid token" });
  }
};
