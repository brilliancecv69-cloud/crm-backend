// crm-frontend/backend/routes/notificationRoutes.js
const express = require("express");
const router = express.Router();
const notificationCtrl = require("../controllers/notificationController");
const auth = require("../middlewares/auth");

router.use(auth);

router.get("/", notificationCtrl.getNotifications);
router.post("/read", notificationCtrl.markAsRead); // استخدمنا POST لأنه يغير حالة البيانات

module.exports = router;