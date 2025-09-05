const fs = require("fs");
const path = require("path");
const Message = require("../models/Message");
const Contact = require("../models/Contact");
const logger = require("../utils/logger");

const INCOMING_QUEUE = "whatsapp_incoming_messages";
const UPLOADS_DIR = path.join(__dirname, "../../uploads");

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

async function runGapFill(client, channel, tenantId) {
  logger.info(`================== [GapFill START Tenant ${tenantId}] ==================`);

  try {
    const lastMessage = await Message.findOne({ tenantId }).sort({ createdAt: -1 });
    const lastMessageTimestamp = lastMessage ? lastMessage.createdAt.getTime() / 1000 : 0;

    const chats = await client.getChats();
    logger.info(`[GapFill][${tenantId}] Found ${chats.length} chats to check.`);
    let queuedCount = 0;

    for (const chat of chats) {
      if (chat.isGroup || chat.isReadOnly) continue;

      const messages = await chat.fetchMessages({ limit: 200 });

      for (const msg of messages) {
        if (msg.timestamp <= lastMessageTimestamp) continue;

        try {
          const rawPhone = msg.fromMe ? msg.to : msg.from;
          if (!rawPhone || !rawPhone.endsWith("@c.us")) continue;
          
          const phone = rawPhone.replace("@c.us", "");
          const contact = await Contact.findOneAndUpdate(
            { phone, tenantId },
            { $setOnInsert: { phone, tenantId, name: chat.name || phone, stage: "lead" } },
            { upsert: true, new: true }
          );

          // ✅✅✅ *** بداية التصحيح المطلوب *** ✅✅✅
          // تم نقل waMessageId إلى داخل كائن meta ليتطابق مع الرسائل الحية
          const normalizedMsg = {
            tenantId,
            contactId: contact._id,
            direction: msg.fromMe ? "out" : "in",
            type: msg.type || "text",
            body: msg.body || "",
            from: msg.from,
            to: msg.to,
            createdAt: new Date(msg.timestamp * 1000),
            meta: {
              waMessageId: msg.id.id, // ⭐️ تم وضع المعرّف هنا
              ack: msg.ack,
              hasMedia: msg.hasMedia,
              caption: msg.body,
            },
          };
          // ✅✅✅ *** نهاية التصحيح المطلوب *** ✅✅✅
          
          if (msg.hasMedia) {
            try {
              const media = await msg.downloadMedia();
              if (media) {
                const extension = media.mimetype.split("/")[1]?.split("+")[0] || "bin";
                const uniqueName = `${Date.now()}-gapfill-${Math.round(Math.random() * 1e9)}.${extension}`;
                const filePath = path.join(UPLOADS_DIR, uniqueName);
                
                fs.writeFileSync(filePath, Buffer.from(media.data, 'base64'));
                const fileUrl = `${process.env.PUBLIC_URL || 'http://localhost:5000'}/uploads/${uniqueName}`;

                normalizedMsg.meta.mediaUrl = fileUrl;
                normalizedMsg.meta.mediaType = media.mimetype;
                normalizedMsg.meta.fileName = media.filename || uniqueName;
                normalizedMsg.type = media.mimetype.split('/')[0] || 'file';
              }
            } catch (err) {
              logger.error("[GapFill] Failed to download or save media", { err: err.message });
            }
          }

          channel.sendToQueue(
            INCOMING_QUEUE,
            Buffer.from(JSON.stringify(normalizedMsg)),
            { persistent: true }
          );

          queuedCount++;
        } catch (error) {
          logger.error(`[GapFill][${tenantId}] ❌ Failed to queue message`, { err: error.message, stack: error.stack });
        }
      }
    }

    if (queuedCount > 0) {
      logger.info(`[GapFill][${tenantId}] ✅ Queued ${queuedCount} missed messages.`);
    } else {
      logger.info(`[GapFill][${tenantId}] ✅ No new messages found.`);
    }
  } catch (err) {
    logger.error(`[GapFill][${tenantId}] ❌ Error during gap-fill`, { err: err.message });
  } finally {
    logger.info("================== [GapFill END] ==================");
  }
}

module.exports = { runGapFill };