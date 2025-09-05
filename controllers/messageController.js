// crm-frontend/backend/controllers/messageController.js
const Message = require("../models/Message");
const Contact = require("../models/Contact");
const logger = require("../utils/logger");

// --- Helper Functions ---
function ok(res, data, code = 200) {
  return res.status(code).json({ ok: true, data });
}
function fail(res, error, code = 400) {
  return res.status(code).json({ ok: false, error });
}

/**
 * Get messages for a specific contact.
 * This function remains unchanged as it only reads from the database.
 */
exports.getMessages = async (req, res) => {
  try {
    const { contactId } = req.query;
    if (!contactId) return fail(res, "contactId is required");

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

/**
 * Add a new outgoing message.
 * This function now passes `path` along with media info
 * so chatService can actually read and send the file.
 */
exports.addMessage = async (req, res) => {
  // We get chatService from the request object, as attached in server.js
  const { chatService } = req;
  const { contactId, type = "text", body, meta = {} } = req.body;
  const { tenantId } = req.user;

  if (!contactId) {
    return fail(res, "contactId is required");
  }

  try {
    let mediaInfo = null;

    if (type !== "text") {
      mediaInfo = {
        url: meta.mediaUrl,       // رابط الملف لواجهة المستخدم
        path: meta.path,          // المسار الداخلي للملف (مهم للإرسال)
        fileName: meta.fileName, 
        mediaType: meta.mediaType
      };

      if (!mediaInfo.path) {
        logger.warn("[API] Media message missing 'path' in meta");
      }
    }

    // Delegate the entire sending process to the chat service
    await chatService.handleOutgoingMessage(tenantId, contactId, body, mediaInfo);

    // We send an immediate "ok" response. The actual message object will be
    // broadcasted back to the client via Socket.io once it's processed.
    return ok(res, { message: "Message sent successfully" });

  } catch (err) {
    logger.error("[API] Error sending message via controller", { err: err.message });
    return fail(res, "Failed to send message: " + err.message, 500);
  }
};
