// backend/routes/messageRoutes.js
const express = require("express");
const router = express.Router();
const auth = require("../middlewares/auth");
const ctrl = require("../controllers/messageController");

// 🟢 لازم أي endpoint يبقى محمي بالـ tenant
router.use(auth);

// ✅ Get messages for a contact
// GET /api/messages?contactId=123
router.get("/", ctrl.getMessages);

// ✅ Add new message
// POST /api/messages { contactId, direction, type, body, meta }
router.post("/", ctrl.addMessage);

module.exports = router;
