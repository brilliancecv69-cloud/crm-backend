// backend/controllers/messageController.js
const Message = require("../models/Message");
const Contact = require("../models/Contact");
const logger = require("../utils/logger");
const { getChannel } = require("../services/rabbitmqService");

const OUTGOING_QUEUE_NAME = "whatsapp_outgoing_messages";

// Helpers
function ok(res, data, code = 200) {
  return res.status(code).json({ ok: true, data });
}
function fail(res, error, code = 400, extra = {}) {
  return res.status(code).json({ ok: false, error, ...extra });
}

// 🟢 Get messages for a contact (محمي بالـ tenantId)
exports.getMessages = async (req, res) => {
  try {
    const { contactId } = req.query;
    if (!contactId) return fail(res, "contactId is required", 400);

    // ✅ تأكد إن الكونتاكت فعلاً تبع نفس الـ tenant
    const contact = await Contact.findOne({
      _id: contactId,
      tenantId: req.user.tenantId,
    });
    if (!contact) return fail(res, "Contact not found", 404);

    const messages = await Message.find({
      contactId,
      tenantId: req.user.tenantId,
    }).sort({ createdAt: 1 });

    return ok(res, messages);
  } catch (err) {
    logger.error("Error fetching messages", { err: err.message });
    return fail(res, "Error fetching messages", 500);
  }
};

// 🟢 Add new message (محمي بالـ tenantId)
exports.addMessage = async (req, res) => {
  try {
    const { contactId, direction, type = "text", body, meta = {} } = req.body || {};
    if (!contactId) return fail(res, "contactId is required", 400);
    if (!direction || !["in", "out"].includes(direction))
      return fail(res, "direction must be 'in' or 'out'", 400);
    if (type === "text" && (!body || !String(body).trim()))
      return fail(res, "body is required for text messages", 400);

    // ✅ contact check بالـ tenantId
    const contact = await Contact.findOne({
      _id: contactId,
      tenantId: req.user.tenantId,
    });
    if (!contact) return fail(res, "Contact not found", 404);

    // 🟢 لو رسالة صادرة → ابعتها للـ Queue
    if (direction === "out") {
      if (!contact.phone) return fail(res, "Contact has no phone number", 400);

      const channel = getChannel();
      if (channel) {
        const task = {
          phone: contact.phone,
          text: body,
          contactId,
          tenantId: req.user.tenantId, // ✅ نمرر الـ tenantId مع التاسك
        };
        channel.sendToQueue(
          OUTGOING_QUEUE_NAME,
          Buffer.from(JSON.stringify(task)),
          { persistent: true }
        );
        logger.info(`[API] Enqueued outgoing message for ${contact.phone}`);

        contact.lastContacted = new Date();
        await contact.save();
      } else {
        logger.error("[API] RabbitMQ channel unavailable.");
        return fail(res, "Message service is temporarily unavailable", 503);
      }
    }

    // ✅ نحفظ الرسالة مع tenantId
    const msg = await Message.create({
      tenantId: req.user.tenantId,
      contactId,
      direction,
      type,
      body,
      meta,
    });

    const io = req.app.get("io");
    if (io) {
      io.to(`tenant:${req.user.tenantId}`).emit("msg:new", msg);
    }

    return ok(res, msg, 201);
  } catch (err) {
    logger.error("Error adding message", { err: err.message });
    return fail(res, "Error adding message", 500);
  }
};
