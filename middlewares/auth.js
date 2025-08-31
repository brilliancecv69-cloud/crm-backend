const jwt = require("jsonwebtoken");

module.exports = (req, res, next) => {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ ok: false, error: "No token, authorization denied" });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);

    // ✅ نخزن كل القيم اللي في التوكن
    req.user = { 
      id: payload.id, 
      role: payload.role, 
      tenantId: payload.tenantId 
    };

    next();
  } catch (err) {
    return res.status(401).json({ ok: false, error: "Invalid or expired token" });
  }
};
