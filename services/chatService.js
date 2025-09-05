// crm-frontend/backend/services/chatService.js
const fs = require("fs");
const path = require("path");
const axios = require("axios");
const { MessageMedia } = require("whatsapp-web.js");
const logger = require("../utils/logger");
const Message = require("../models/Message");
const Contact = require("../models/Contact");

const UPLOADS_DIR = path.join(__dirname, "../../uploads");
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

class ChatService {
  constructor(io) {
    this.io = io;
    this.clients = new Map();
  }

  registerClient(tenantId, client) {
    this.clients.set(tenantId, client);
    logger.info(`[ChatService] WhatsApp client registered for tenant ${tenantId}`);
  }

  /**
   * ✅ تم تعديل هذه الدالة بالكامل
   * تعالج هذه الدالة الآن جميع الرسائل (الواردة والصادرة) وتمنع الكتابة فوق بيانات الوسائط الصحيحة.
   */
  async processAndBroadcastMessage(msg, tenantId) {
    if (!msg || !msg.id?.id) {
      logger.warn("[ChatService] Ignoring message with invalid ID.", { msg });
      return;
    }

    // ✨ التحقق الوقائي: هذا هو أهم جزء في الإصلاح ✨
    // إذا كانت الرسالة موجودة بالفعل في قاعدة البيانات وهي رسالة وسائط،
    // والحدث الحالي هو مجرد تحديث (مثل تأكيد الاستلام)، فسنقوم بتحديث الحالة فقط.
    const existingMessage = await Message.findOne({ tenantId, "meta.waMessageId": msg.id.id });
    if (existingMessage && existingMessage.meta?.mediaUrl && !msg.hasMedia) {
      existingMessage.meta.ack = msg.ack;
      await existingMessage.save();
      this.io.to(`tenant:${tenantId}`).emit("msg:new", existingMessage.toObject());
      logger.info(`[ChatService] ACK updated for media message: ${msg.id.id}`);
      return; // توقف هنا لمنع الكتابة فوق البيانات
    }

    const rawPhone = msg.fromMe ? msg.to : msg.from;
    const phone = rawPhone.replace("@c.us", "");

    try {
      const contact = await Contact.findOneAndUpdate(
        { phone, tenantId },
        { $setOnInsert: { phone, tenantId, name: phone, stage: "lead" } },
        { upsert: true, new: true }
      );

      const normalizedMsg = {
        tenantId,
        contactId: contact._id,
        direction: msg.fromMe ? "out" : "in",
        type: 'text', // القيمة الافتراضية
        body: msg.body || "",
        createdAt: new Date(msg.timestamp * 1000),
        meta: {
          waMessageId: msg.id.id,
          ack: msg.ack,
          hasMedia: msg.hasMedia,
        },
      };

      if (msg.hasMedia) {
        try {
          const media = await msg.downloadMedia();
          if (media && media.mimetype) {
            const extension = media.mimetype.split("/")[1]?.split("+")[0] || "bin";
            const uniqueName = `${Date.now()}-${media.filename || Math.round(Math.random() * 1e9)}.${extension}`;
            const filePath = path.join(UPLOADS_DIR, uniqueName);
            fs.writeFileSync(filePath, Buffer.from(media.data, "base64"));

            const host = process.env.PUBLIC_URL || "http://localhost:5000";
            const fileUrl = `${host}/uploads/${uniqueName}`;

            normalizedMsg.meta.mediaUrl = fileUrl;
            normalizedMsg.meta.mediaType = media.mimetype;
            normalizedMsg.meta.fileName = media.filename || uniqueName;
            
            const mainType = media.mimetype.split("/")[0];
            normalizedMsg.type = ["image", "video", "audio"].includes(mainType) ? mainType : "file";
            normalizedMsg.body = msg.body; // Caption
          }
        } catch(err) {
            logger.error(`[ChatService] Media download failed for msg ${msg.id?.id}`, { error: err.message });
        }
      }

      const savedMessage = await Message.findOneAndUpdate(
        { tenantId, "meta.waMessageId": msg.id.id },
        { $set: normalizedMsg },
        { upsert: true, new: true, runValidators: true }
      );

      if (savedMessage) {
        this.io.to(`tenant:${tenantId}`).emit("msg:new", savedMessage.toObject());
      }
    } catch (err) {
      logger.error(`[ChatService] Error processing message ${msg.id?.id}`, { error: err.message });
    }
  }

  async handleIncomingMessage(msg, tenantId) {
    await this.processAndBroadcastMessage(msg, tenantId);
  }

  /**
   * ✅ تم تعديل هذه الدالة
   * الآن هي مسؤولة فقط عن إرسال الرسالة. عملية الحفظ ستتم عبر حدث "message_create" الذي سيعالج بواسطة الدالة المعدلة أعلاه.
   */
  async handleOutgoingMessage(tenantId, contactId, body, mediaInfo = null) {
    const client = this.clients.get(tenantId);
    if (!client || (await client.getState()) !== "CONNECTED") {
      throw new Error(`WhatsApp client for tenant ${tenantId} is not connected.`);
    }

    const contact = await Contact.findById(contactId);
    if (!contact || !contact.phone) throw new Error(`Contact not found: ${contactId}`);

    const jid = `${contact.phone}@c.us`;

    if (mediaInfo) {
      if (mediaInfo.path && fs.existsSync(mediaInfo.path)) {
        const media = MessageMedia.fromFilePath(mediaInfo.path);
        await client.sendMessage(jid, media, { caption: body });
      } else {
        throw new Error("Media path is missing or invalid.");
      }
    } else {
      await client.sendMessage(jid, body);
    }

    logger.info(`[ChatService] Send command issued to WhatsApp for ${contact.phone}`);
    // تم حذف منطق الحفظ المكرر من هنا
  }
}

module.exports = ChatService;