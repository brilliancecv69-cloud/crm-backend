const amqp = require("amqp-connection-manager");
const logger = require("../utils/logger");

// --- إعدادات الطوابير والمتغيرات ---
const RABBITMQ_URL = process.env.RABBITMQ_URL || "amqp://localhost:5672";
const INCOMING_QUEUE = "whatsapp_incoming_messages";
const OUTGOING_QUEUE = "whatsapp_outgoing_messages";

let connection;
let channelWrapper;
let ioInstance;
let chatServiceInstance; // سيتم حقن النسخة الوحيدة من ChatService هنا

/**
 * دالة التهيئة الرئيسية التي تتلقى الاعتماديات (Dependencies) من server.js
 * @param {object} io - نسخة Socket.IO
 * @param {object} chatService - النسخة الوحيدة من ChatService
 */
function connectRabbitMQ(io, chatService) {
  if (connection) {
    logger.info("[RabbitMQ] Connection already established.");
    return;
  }
  
  ioInstance = io;
  chatServiceInstance = chatService;

  try {
    connection = amqp.connect([RABBITMQ_URL]);

    connection.on("connect", () => logger.info("✅ RabbitMQ Connected!"));
    connection.on("disconnect", (err) => {
        logger.error("❗️ RabbitMQ disconnected.", err);
    });

    channelWrapper = connection.createChannel({
      json: true,
      setup: async (channel) => {
        logger.info("[RabbitMQ] Setting up channel and queues...");
        await channel.assertQueue(INCOMING_QUEUE, { durable: true });
        await channel.assertQueue(OUTGOING_QUEUE, { durable: true });

        // ✅ أهم تعديل: التحكم في عدد الرسائل لكل عامل
        channel.prefetch(1);

        // بدء تشغيل المستهلكين بعد إعداد القناة
        consumeIncomingMessages(channel);
        consumeOutgoingMessages(channel);
      },
    });

  } catch (err) {
    logger.error("❌ Failed to initialize RabbitMQ connection", { err });
  }
}

/**
 * يستهلك الرسائل الصادرة من الطابور ويرسلها عبر واتساب
 * @param {object} channel - قناة RabbitMQ
 */
async function consumeOutgoingMessages(channel) {
    logger.info("[RabbitMQ] 📤 Consumer for OUTGOING messages is running.");
    await channel.consume(OUTGOING_QUEUE, async (msg) => {
        if (!msg) return;

        try {
            const task = JSON.parse(msg.content.toString());
            const { tenantId, contactId, body, mediaInfo } = task;

            if (!tenantId || !contactId || (!body && !mediaInfo)) {
                logger.error("[RabbitMQ] Invalid outgoing task, missing required content (body or media).", task);
                return channel.ack(msg); // إزالة الرسالة غير الصالحة
            }

            await chatServiceInstance.handleOutgoingMessage(tenantId, contactId, body, mediaInfo);
            
            logger.info(`[RabbitMQ] ✅ Successfully processed outgoing message for contact ${contactId}`);
            channel.ack(msg);
        } catch (err) {
            logger.error("❌ [RabbitMQ] Error sending outgoing message. Re-queueing.", { error: err.message });
            // ✅ إرجاع الرسالة للطابور بدون ضياع
            channel.nack(msg, false, true);
        }
    }, { noAck: false });
}

/**
 * يستهلك الرسائل الواردة ويعالجها
 * @param {object} channel - قناة RabbitMQ
 */
async function consumeIncomingMessages(channel) {
    const Message = require("../models/Message");
    const Contact = require("../models/Contact");

    logger.info("[RabbitMQ] 📥 Consumer for INCOMING messages is running.");
    await channel.consume(INCOMING_QUEUE, async (msg) => {
        if (!msg) return;
        
        try {
            const data = JSON.parse(msg.content.toString());
            const { tenantId, from, direction, body, meta } = data;
            const waMessageId = meta?.waMessageId;

            if (!tenantId || !waMessageId) {
                logger.warn("[RabbitMQ] Incoming message missing tenantId or waMessageId.", { waMessageId });
                return channel.ack(msg);
            }

            const contactPhone = (direction === 'out' ? data.to : from).replace('@c.us', '');
            const contact = await Contact.findOneAndUpdate(
                { phone: contactPhone, tenantId },
                { $setOnInsert: { name: meta.notifyName || contactPhone, phone: contactPhone, tenantId } },
                { upsert: true, new: true }
            );

            const messagePayload = {
                tenantId,
                contactId: contact._id,
                direction,
                type: data.type === 'chat' ? 'text' : data.type,
                body: body || '',
                meta: { waMessageId },
                createdAt: new Date(data.createdAt),
            };

            const savedMessage = await Message.findOneAndUpdate(
                { tenantId, "meta.waMessageId": waMessageId },
                { $set: messagePayload },
                { upsert: true, new: true }
            );

            ioInstance.to(`tenant:${tenantId}`).emit("msg:new", savedMessage.toObject());
            channel.ack(msg);
        } catch (err) {
            logger.error("❌ [RabbitMQ] Error processing incoming message.", { error: err.message });
            // ✅ هنا بنستخدم nack مع requeue=false → الرسائل اللي بتعمل crash متتكررش بلا نهاية
            channel.nack(msg, false, false);
        }
    }, { noAck: false });
}

/**
 * دالة مساعدة لنشر الرسائل إلى طابور الإرسال
 * @param {object} payload - محتوى الرسالة المراد إرسالها
 */
async function publishToOutgoingQueue(payload) {
    if (!channelWrapper) {
        throw new Error("RabbitMQ channel is not available.");
    }
    await channelWrapper.sendToQueue(OUTGOING_QUEUE, payload, { persistent: true });
    logger.info(`[RabbitMQ] 📤 Message for contact ${payload.contactId} queued for sending.`);
}

module.exports = {
    connectRabbitMQ,
    publishToOutgoingQueue
};
