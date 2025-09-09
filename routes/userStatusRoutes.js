const router = require("express").Router();
const auth = require("../middlewares/auth");
const asyncHandler = require("../middlewares/asyncHandler");
const User = require("../models/User");
const UserSession = require("../models/UserSession");

router.use(auth);

/**
 * @route   GET /api/users/status
 * @desc    Get all users of tenant + آخر جلسة (مفتوحة أو مقفولة)
 */
router.get(
  "/status",
  asyncHandler(async (req, res) => {
    const tenantId = req.user.tenantId;

    // هات كل اليوزرز بتوع التينانت
    const users = await User.find({ tenantId })
      .select("name email role isOnline isIdle lastSeen tenantId")
      .lean();

    // هات آخر جلسة (سواء مفتوحة أو مقفولة) لكل يوزر
    const sessions = await UserSession.aggregate([
      { $match: { tenantId } },
      { $sort: { loginTime: -1 } },
      {
        $group: {
          _id: "$userId",
          loginTime: { $first: "$loginTime" },
          lastActionAt: { $first: "$lastActionAt" },
          logoutTime: { $first: "$logoutTime" },
          isIdle: { $first: "$isIdle" },
        },
      },
    ]);

    const sessionsMap = {};
    sessions.forEach((s) => (sessionsMap[s._id.toString()] = s));

    const data = users.map((u) => {
      const s = sessionsMap[u._id.toString()];
      let status = "offline";
      if (u.isOnline) status = u.isIdle ? "idle" : "online";

      return {
        id: u._id,
        name: u.name,
        email: u.email,
        role: u.role,
        status,
        firstLogin: s?.loginTime || null,
        lastActionAt: s?.lastActionAt || null,
        lastSeen: u.lastSeen || null,
        tenant: u.tenantId,
      };
    });

    res.json({ ok: true, users: data });
  })
);

/**
 * @route   GET /api/users/:id/sessions
 * @desc    Get full session history + duration حتى لو الجلسة لسه شغالة
 */
router.get(
  "/:id/sessions",
  asyncHandler(async (req, res) => {
    const userId = req.params.id;
    const tenantId = req.user.tenantId;

    const sessions = await UserSession.find({ userId, tenantId })
      .sort({ loginTime: -1 })
      .lean();

    // نحسب الـ duration لو الجلسة لسه مفتوحة
    const mapped = sessions.map((s) => {
      let duration = s.duration || 0;
      if (!s.logoutTime) {
        duration = Math.floor((Date.now() - new Date(s.loginTime)) / 1000);
      }
      return { ...s, duration };
    });

    res.json({ ok: true, sessions: mapped });
  })
);

module.exports = router;
