const Message = require("../models/Message");
const Contact = require("../models/Contact");
const logger = require("../utils/logger");

const INCOMING_QUEUE = "whatsapp_incoming_messages";

async function runGapFill(client, channel, tenantId) {
  logger.info(`================== [GapFill START Tenant ${tenantId}] ==================`);

  try {
    const lastMessage = await Message.findOne({ direction: "in", tenantId })
      .sort({ createdAt: -1 });

    const lastMessageTimestamp = lastMessage
      ? lastMessage.createdAt.getTime() / 1000
      : 0;

    if (lastMessage) {
      logger.info(
        `[GapFill][${tenantId}] Last saved message at: ${lastMessage.createdAt.toLocaleString()}`
      );
    } else {
      logger.warn(
        `[GapFill][${tenantId}] No previous messages found. Skipping gap-fill.`
      );
      return;
    }

    const chats = await client.getChats();
    logger.info(`[GapFill][${tenantId}] Found ${chats.length} chats to check.`);

    let queuedCount = 0;

    for (const chat of chats) {
      if (chat.isGroup || chat.isReadOnly) continue;

      const messages = await chat.fetchMessages({ limit: 200 });
      logger.info(
        `[GapFill][${tenantId}] Checking chat ${chat.id.user} → fetched ${messages.length} msgs`
      );

      for (const msg of messages) {
        if (msg.fromMe) continue; // بس الواردة
        if (msg.timestamp <= lastMessageTimestamp) continue;

        try {
          // ✅ حل مشكلة contactId بدل ما نسيبها null
          const phone = msg.from.replace("@c.us", "");
          let contact = await Contact.findOne({ phone, tenantId });

          if (!contact) {
            contact = await Contact.create({
              tenantId,
              phone,
              name: phone,
              stage: "lead",
              whatsappFirstSeen: new Date(),
            });
            logger.info(`[GapFill][${tenantId}] Created new contact for ${phone}`);
          }

          const normalizedMsg = {
            tenantId,
            contactId: contact?._id || null,
            direction: "in",
            type: msg.type || "text",
            body: msg.body,
            waMessageId: msg.id.id,
            from: msg.from,
            to: msg.to,
            createdAt: new Date(msg.timestamp * 1000),
            meta: {
              ack: msg.ack,
              hasMedia: msg.hasMedia,
            },
          };

          channel.sendToQueue(
            INCOMING_QUEUE,
            Buffer.from(JSON.stringify(normalizedMsg)),
            { persistent: true }
          );

          queuedCount++;
          logger.info(
            `[GapFill][${tenantId}] Queued missed msg from ${msg.from.split("@")[0]}`
          );
        } catch (error) {
          logger.error(
            `[GapFill][${tenantId}] ❌ Failed to queue message ${msg.id?.id}`,
            { err: error.message }
          );
        }
      }
    }

    if (queuedCount > 0) {
      logger.info(
        `[GapFill][${tenantId}] ✅ Queued ${queuedCount} missed messages.`
      );
    } else {
      logger.info(`[GapFill][${tenantId}] ✅ No new messages found.`);
    }
  } catch (err) {
    logger.error(`[GapFill][${tenantId}] ❌ Error during gap-fill`, {
      err: err.message,
    });
  } finally {
    logger.info("================== [GapFill END] ==================");
  }
}

module.exports = { runGapFill };
