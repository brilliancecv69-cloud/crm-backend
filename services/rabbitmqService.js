const amqp = require("amqplib");
const logger = require("../utils/logger");
const Message = require("../models/Message");
const Contact = require("../models/Contact");
const Notification = require("../models/Notification");

const RABBITMQ_URL = process.env.RABBITMQ_URL || "amqp://localhost:5672";
const INCOMING_QUEUE = "whatsapp_incoming_messages";

let channel = null;
let ioInstance = null;

async function connectRabbitMQ(io) {
  ioInstance = io;
  try {
    const connection = await amqp.connect(RABBITMQ_URL);
    connection.on("error", (err) => logger.error("❌ RabbitMQ connection error", { err }));
    connection.on("close", () => {
      logger.error("❗️ RabbitMQ connection closed. Reconnecting...");
      setTimeout(() => connectRabbitMQ(io), 5000);
    });
    channel = await connection.createChannel();
    await channel.assertQueue(INCOMING_QUEUE, { durable: true });
    logger.info("✅ RabbitMQ Connected and queue is ready.");
    
    consumeIncomingMessages();
  } catch (err) {
    logger.error("❌ Failed to connect to RabbitMQ", { err });
    setTimeout(() => connectRabbitMQ(io), 5000);
  }
}

function getChannel() { return channel; }

async function consumeIncomingMessages() {
  if (!channel || !ioInstance) return;
  channel.prefetch(1);

  channel.consume(INCOMING_QUEUE, async (msg) => {
    if (msg === null) return;
    try {
      const data = JSON.parse(msg.content.toString());
      
      // ✅✅✅ *** بداية التصحيح المطلوب *** ✅✅✅
      // تم تعديل هذا الجزء ليكون أكثر مرونة ويقرأ المعرّف من المكان الصحيح
      const { tenantId, from, to, direction, type, body, meta, createdAt } = data;
      const waMessageId = data.waMessageId || meta?.waMessageId;

      if (!tenantId || !waMessageId) {
        logger.warn("[RabbitMQ] Message missing tenantId or waMessageId, skipping.", { data });
        return channel.ack(msg);
      }
      // ✅✅✅ *** بداية التصحيح المطلوب *** ✅✅✅
      // If the message type from WhatsApp is 'chat', we convert it to 'text'
      // to match our database schema.
      if (type === 'chat') {
        type = 'text';
      }
      // ✅✅✅ *** نهاية التصحيح المطلوب *** ✅✅✅
      const contactPhone = (direction === 'out' ? to : from).replace('@c.us', '');
      const contact = await Contact.findOneAndUpdate(
        { phone: contactPhone, tenantId },
        { $setOnInsert: { phone: contactPhone, tenantId, name: contactPhone, stage: "lead" } },
        { upsert: true, new: true }
      );

      // Prevent saving empty text messages
      if (type === 'text' && (!body || !body.trim())) {
        return channel.ack(msg);
      }
      
      const messagePayload = {
        tenantId,
        contactId: contact._id,
        direction,
        type,
        body: body || '',
        meta: { ...meta, waMessageId }, // Ensure waMessageId is always in meta
        createdAt: createdAt ? new Date(createdAt) : new Date(),
      };
      
      const savedMessage = await Message.findOneAndUpdate(
        { tenantId, "meta.waMessageId": waMessageId },
        { $set: messagePayload },
        { upsert: true, new: true, runValidators: true }
      );

      ioInstance.to(`tenant:${tenantId}`).emit("msg:new", savedMessage.toObject());
      logger.info(`[RabbitMQ] 💬 Processed message for ${contact.phone} with type ${type}`);
      
      channel.ack(msg);
    } catch (err) {
      logger.error("❌ [RabbitMQ] Error consuming message", { error: err.message, stack: err.stack });
      channel.nack(msg, false, false); // Acknowledge with requeue=false to avoid infinite loops on bad messages
    }
  });

  logger.info("[RabbitMQ] Consumer is ready and waiting for messages.");
}

module.exports = { connectRabbitMQ, getChannel };