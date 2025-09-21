const express = require("express");
const asyncHandler = require("../middlewares/asyncHandler");
const { getManager } = require("../listener");
const logger = require("../utils/logger");
const WhatsAppAccount = require("../models/WhatsAppAccount");

const router = express.Router();

// @desc    Start WhatsApp session for the tenant
// @route   POST /api/whatsapp/start
// @access  Private
router.post(
  "/start",
  asyncHandler(async (req, res) => {
    const tenantId = req.user.tenantId;
    logger.info(`[API] Received request to start WhatsApp for tenant ${tenantId}`);
    const manager = getManager();
    manager.startClient(tenantId); // This will run in the background
    res.json({
      ok: true,
      message: "WhatsApp client initialization process started.",
    });
  })
);

// @desc    Create/update WhatsApp account settings
// @route   POST /api/whatsapp/accounts
// @access  Private
router.post(
  "/accounts",
  asyncHandler(async (req, res) => {
    const { name } = req.body;
    const tenantId = req.user.tenantId;

    let account = await WhatsAppAccount.findOne({ tenantId });

    if (account) {
      account.name = name || account.name;
      account.updatedAt = Date.now();
    } else {
      account = new WhatsAppAccount({
        tenantId,
        name: name || `Account for ${tenantId}`,
      });
    }

    await account.save();
    res.status(201).json({ ok: true, data: account });
  })
);

// @desc    Logout, delete session files, and immediately restart the client
// @route   DELETE /api/whatsapp/session
// @access  Private
router.delete(
  "/session",
  asyncHandler(async (req, res) => {
    const tenantId = req.user.tenantId;
    if (!tenantId) {
      return res.status(400).json({ ok: false, error: "Tenant not found" });
    }

    logger.warn(`[API] Received request to DELETE and RESTART WhatsApp session for tenant ${tenantId}`);
    
    const manager = getManager();
    
    // 1. حذف الجلسة القديمة وملفاتها
    await manager.logoutClient(tenantId);
    
    // --- ✅ START: الكود الجديد والمهم ---
    // 2. ابدأ فورًا عملية جديدة لإنشاء جلسة وطلب QR Code
    manager.startClient(tenantId);
    // --- ✅ END: الكود الجديد والمهم ---

    res.status(200).json({ ok: true, message: "Session deleted and re-initialization process started." });
  })
);

module.exports = router;