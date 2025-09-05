const express = require("express");
const router = express.Router();
// ✅✅✅ *** هذا هو التصحيح *** ✅✅✅
// تم حذف الأقواس المعقوفة {} للعودة إلى طريقة الاستيراد الصحيحة
const auth = require("../middlewares/auth");
const asyncHandler = require("../middlewares/asyncHandler");
const { getManager } = require("../listener");

// @desc    Start the WhatsApp client for the logged-in user's tenant
// @route   POST /api/whatsapp/start
// @access  Private
router.post('/start', auth, asyncHandler(async (req, res) => {
    const manager = getManager();
    const tenantId = String(req.user.tenantId);
    manager.startClient(tenantId);
    res.json({ ok: true, message: "WhatsApp client initialization started." });
}));

// @desc    Stop the WhatsApp client for the logged-in user's tenant
// @route   POST /api/whatsapp/stop
// @access  Private
router.post('/stop', auth, asyncHandler(async (req, res) => {
    const manager = getManager();
    const tenantId = String(req.user.tenantId);
    await manager.stopClient(tenantId);
    res.json({ ok: true, message: "WhatsApp client stopped." });
}));

// @desc    Logout the WhatsApp client and remove session data
// @route   POST /api/whatsapp/logout
// @access  Private
router.post('/logout', auth, asyncHandler(async (req, res) => {
    const manager = getManager();
    const tenantId = String(req.user.tenantId);
    await manager.logoutClient(tenantId);
    res.json({ ok: true, message: "WhatsApp client logged out and session removed." });
}));

module.exports = router;