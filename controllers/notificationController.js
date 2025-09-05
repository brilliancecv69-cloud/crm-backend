// crm-frontend/backend/controllers/notificationController.js
const Notification = require("../models/Notification");

exports.getNotifications = async (req, res) => {
    try {
        const notifications = await Notification.find({
            userId: req.user.id,
            tenantId: req.user.tenantId
        }).sort({ createdAt: -1 }).limit(20); // جلب آخر 20 إشعارًا

        res.json({ ok: true, data: notifications });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
};

exports.markAsRead = async (req, res) => {
    try {
        await Notification.updateMany(
            { userId: req.user.id, tenantId: req.user.tenantId, isRead: false },
            { $set: { isRead: true } }
        );
        res.json({ ok: true, data: { message: "All notifications marked as read" } });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
};