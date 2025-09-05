// crm-frontend/backend/services/unifiedSync.js
const fs = require("fs");
const path = require("path");
const logger = require("../utils/logger");
const Message = require("../models/Message");
const Contact = require("../models/Contact");

const INCOMING_QUEUE = "whatsapp_incoming_messages";
const UPLOADS_DIR = path.join(__dirname, "../../uploads"); // المسار إلى مجلد الرفع

// التأكد من وجود مجلد الرفع
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

async function setupUnifiedSync(client, channel, tenantId) {
  logger.info(`[UnifiedSync][${tenantId}] Starting unified sync...`);

  // 🟢 Event listener (real-time)
  client.on("message", async (msg) => {
    try {
      // تجاهل الرسائل التي لا تأتي من مستخدمين (مثل تحديثات الحالة)
      if (!msg.from.endsWith('@c.us') && !msg.to.endsWith('@c.us')) return;

      const normalized = {
        tenantId,
        fromMe: msg.fromMe, // ✅ إضافة معلومة المرسل
        direction: msg.fromMe ? "out" : "in",
        type: msg.type || "text",
        body: msg.type === "text" ? msg.body : "",
        waMessageId: msg.id.id,
        from: msg.from,
        to: msg.to,
        createdAt: new Date(msg.timestamp * 1000),
        meta: {
          ack: msg.ack,
          hasMedia: msg.hasMedia,
          caption: msg.body, // في رسائل الميديا، body هو الـ caption
        },
      };

      // ✅✅✅ بداية التعديل الجوهري: التعامل مع الوسائط كملفات ✅✅✅
      if (msg.hasMedia) {
        try {
          const media = await msg.downloadMedia();
          if (media) {
            const extension = media.mimetype.split("/")[1]?.split("+")[0] || "bin";
            const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1e9)}.${extension}`;
            const filePath = path.join(UPLOADS_DIR, uniqueName);
            
            // كتابة الملف على السيرفر
            fs.writeFileSync(filePath, Buffer.from(media.data, 'base64'));

            // إنشاء رابط يمكن للواجهة الأمامية الوصول إليه
            const fileUrl = `${process.env.API_BASE_URL.replace('/api', '')}/uploads/${uniqueName}`;

            normalized.meta.mediaUrl = fileUrl;
            normalized.meta.mediaType = media.mimetype;
            normalized.meta.fileName = media.filename || uniqueName;
            normalized.type = media.mimetype.split('/')[0] || 'file'; // تحديد النوع (image, video, etc.)
          }
        } catch (err) {
          logger.error(`[UnifiedSync][${tenantId}] Failed to download or save media`, { err: err.message });
        }
      }
      // ✅✅✅ نهاية التعديل الجوهري ✅✅✅

      channel.sendToQueue(
        INCOMING_QUEUE,
        Buffer.from(JSON.stringify(normalized)),
        { persistent: true }
      );

      logger.info(
        `[UnifiedSync][${tenantId}] Event msg queued (${normalized.direction}) type=${normalized.type}`
      );
    } catch (err) {
      logger.error(`[UnifiedSync][${tenantId}] Event failed`, { err: err.message });
    }
  });

  // 🟢 Periodic polling fallback (كل دقيقتين)
  // تم ترك هذا الجزء كما هو لأنه يستخدم نفس المنطق، لكن التعديل أعلاه هو الأهم
  setInterval(async () => {
    try {
      const chats = await client.getChats();
      let newCount = 0;

      for (const chat of chats) {
        if (chat.isGroup || chat.isReadOnly) continue;

        const messages = await chat.fetchMessages({ limit: 50 });
        for (const msg of messages) {
          const exists = await Message.findOne({
            tenantId,
            "meta.waMessageId": msg.id.id,
          });
          if (exists) continue;

          // (يمكنك تطبيق نفس منطق حفظ الملفات هنا أيضاً إذا أردت تحسين هذا الجزء)
          
          // الكود الأصلي للمزامنة الدورية يبقى كما هو حالياً للتبسيط
          const normalized = {
            tenantId,
            direction: msg.fromMe ? "out" : "in",
            type: msg.type || "text",
            body: msg.type === "text" ? msg.body : "",
            waMessageId: msg.id.id,
            from: msg.from,
            to: msg.to,
            createdAt: new Date(msg.timestamp * 1000),
            meta: {
              ack: msg.ack,
              hasMedia: msg.hasMedia,
              caption: msg.body,
            },
          };
          
          channel.sendToQueue(
            INCOMING_QUEUE,
            Buffer.from(JSON.stringify(normalized)),
            { persistent: true }
          );
          newCount++;
        }
      }

      if (newCount > 0) {
        logger.info(`[UnifiedSync][${tenantId}] Polling queued ${newCount} new msgs`);
      }
    } catch (err) {
      logger.error(`[UnifiedSync][${tenantId}] Polling failed`, { err: err.message });
    }
  }, 2 * 60 * 1000);
}

module.exports = { setupUnifiedSync };