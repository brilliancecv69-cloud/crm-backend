// backend/controllers/userStatusController.js
const express = require("express");
const router = express.Router();
const auth = require("../middlewares/auth");
const asyncHandler = require("../middlewares/asyncHandler");
const User = require("../models/User");
const UserSession = require("../models/UserSession");

// كل الروتات هنا محمية
router.use(auth);

/**
 * GET /api/users/status
 * ترجع لكل يوزر: online / idle / offline + firstLogin + lastActionAt + lastSeen
 */
router.get("/status", asyncHandler(async (req, res) => {
  const tenantId = req.user.tenantId;

  // 🟢 نجيب اليوزرز في نفس التينانت
  const users = await User.find({ tenantId })
    .select("name email role isOnline isIdle lastSeen")
    .lean();

  // 🟢 نجيب آخر سيشن (المفتوح حاليا) لكل يوزر
  const sessions = await UserSession.aggregate([
    { $match: { tenantId, logoutTime: null } },
    { $sort: { loginTime: -1 } },
    {
      $group: {
        _id: "$userId",
        loginTime: { $first: "$loginTime" },
        lastActionAt: { $first: "$lastActionAt" },
        isIdle: { $first: "$isIdle" }
      }
    }
  ]);

  const sessionsMap = {};
  sessions.forEach(s => {
    sessionsMap[s._id.toString()] = s;
  });

  // 🟢 نجمع الداتا
  const data = users.map(u => {
    const s = sessionsMap[u._id.toString()];
    let status = "offline";
    if (u.isOnline) {
      status = u.isIdle ? "idle" : "online";
    }

    return {
      id: u._id,
      name: u.name,
      email: u.email,
      role: u.role,
      status,             // online / idle / offline
      firstLogin: s?.loginTime || null,
      lastActionAt: s?.lastActionAt || null,
      lastSeen: u.lastSeen || null
    };
  });

  res.json({ ok: true, users: data });
}));

module.exports = router;
