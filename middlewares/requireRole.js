// ✅ Middleware للتحكم في الصلاحيات حسب الدور
// usage: router.get("/users", auth, requireRole("admin"), ctrl.listUsers)

module.exports = function requireRole(...roles) {
  return (req, res, next) => {
    // لو مفيش user أو role مش من المسموح بيها
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ ok: false, error: "Forbidden: insufficient role" });
    }
    next();
  };
};
