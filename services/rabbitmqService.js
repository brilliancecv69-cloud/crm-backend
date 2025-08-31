const amqp = require("amqplib");
const logger = require("../utils/logger");
const Message = require("../models/Message");
const Contact = require("../models/Contact");
const Notification = require("../models/Notification"); // 🟢 إضافة جديدة

const RABBITMQ_URL = process.env.RABBITMQ_URL || "amqp://localhost";
const OUTGOING_QUEUE = "whatsapp_outgoing_messages";
const INCOMING_QUEUE = "whatsapp_incoming_messages";

let channel = null;

// 🟢 Connect Producer + Consumer
async function connectRabbitMQ(io) {
  try {
    const connection = await amqp.connect(RABBITMQ_URL);

    connection.on("error", (err) => {
      logger.error("❌ [API] RabbitMQ connection error", { err: err.message });
      channel = null;
    });

    connection.on("close", () => {
      logger.error("❗️ [API] RabbitMQ connection closed. Reconnecting...");
      channel = null;
      setTimeout(() => connectRabbitMQ(io), 5000);
    });

    channel = await connection.createChannel();
    await channel.assertQueue(OUTGOING_QUEUE, { durable: true });
    await channel.assertQueue(INCOMING_QUEUE, { durable: true });

    logger.info("✅ [API] Connected to RabbitMQ (producer + consumer)");

    consumeIncomingMessages(io); // 🟢 شغل الكونسومر
  } catch (err) {
    logger.error("❌ [API] Failed to connect to RabbitMQ", { err: err.message });
    setTimeout(() => connectRabbitMQ(io), 5000);
  }
}

function getChannel() {
  return channel;
}

// 🟢 Consumer للـ incoming messages
function consumeIncomingMessages(io) {
  if (!channel) return;

  channel.consume(INCOMING_QUEUE, async (msg) => {
    try {
      const data = JSON.parse(msg.content.toString());
      const { tenantId, from, body } = data;

      if (!tenantId || !from) {
        channel.ack(msg);
        return;
      }

      // 🟢 نتأكد إن الرسالة جاية من رقم واتساب فعلي مش جروب/سيستم
      if (!from.endsWith("@c.us")) {
        logger.warn("⚠️ Ignored non-user message", { from, tenantId });
        channel.ack(msg);
        return;
      }

      // 🟢 استخرج رقم الموبايل بشكل نظيف
      const phone = from.replace("@c.us", "").replace(/\D/g, "");
      if (!phone) {
        logger.warn("⚠️ Ignored message with no phone", { from, tenantId });
        channel.ack(msg);
        return;
      }

      // 🟢 تأكد من وجود contact مع معالجة الـ duplicate
      let contact = await Contact.findOne({ phone, tenantId });
      if (!contact) {
        try {
          contact = await Contact.create({
            tenantId,
            phone,
            name: phone,
            stage: "lead",
          });
        } catch (err) {
          if (err.code === 11000) {
            // 📌 Duplicate → رجع نفس الـ contact
            contact = await Contact.findOne({ phone, tenantId });
          } else {
            throw err;
          }
        }
      }

      // 🟢 خزّن الرسالة
      const saved = await Message.create({
        tenantId,
        contactId: contact._id,
        direction: "in",
        type: data.type || "text", // 👈 خدت النوع من data
        body: body || "",
        meta: data,
      });

      // 🟢 لازم نبعت tenantId مع الرسالة عشان الـ frontend يفلتر صح
      const payload = { ...saved.toObject(), tenantId };

      // 🟢 ابثها على الـ socket للغرفة الخاصة بالـ tenant
      io.to(`tenant:${tenantId}`).emit("msg:new", payload);

      // ✅✅✅ **إشعارات لو فيه assignedTo**
      if (contact && contact.assignedTo) {
        const notificationText = `New message from ${contact.name || contact.phone}: "${(body || '').substring(0, 30)}..."`;
        const notificationLink = `/contacts/${contact._id}`;
        
        const notification = await Notification.create({
            tenantId,
            userId: contact.assignedTo,
            text: notificationText,
            link: notificationLink,
        });

        // إرسال الإشعار عبر Socket.io إلى غرفة المستخدم المحددة
        io.to(`user:${contact.assignedTo}`).emit("new_notification", notification);
      }

      channel.ack(msg);
    } catch (err) {
      logger.error("❌ [API] Error consuming incoming message", { err: err.message });
      channel.nack(msg);
    }
  });

  logger.info("[API] Listening for incoming WhatsApp messages...");
}

module.exports = { connectRabbitMQ, getChannel };
