// crm-frontend/backend/worker.js
require("dotenv").config();
const amqp = require("amqplib");
const connectDB = require("./config/db");
const logger = require("./utils/logger");
const Contact = require("./models/Contact");
const Message = require("./models/Message");

// socket.io client (لازم علشان يقدر يرن إشعارات للـ frontend)
const { io } = require("socket.io-client");
const socket = io(process.env.SOCKET_ORIGIN || "http://localhost:5000", {
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 2000,
});

// io وهمي لو حصلت مشكلة
const mockIo = { emit: () => {}, to: () => mockIo };

const RABBITMQ_URL = process.env.RABBITMQ_URL || "amqp://localhost";
const QUEUE_NAME = "whatsapp_incoming_messages";

// =======================
// معالجة أي رسالة داخلة
// =======================
async function processIncomingMessage(msg, io) {
  try {
    const rawPhone = msg.from?.split("@")[0];
    const phone = Contact.schema.path("phone").options.set(rawPhone);

    // 🟢 tenantId لازم ييجي من الـ msg (اللي ضفناه في listener)
    const tenantId = msg.tenantId;
    if (!tenantId) {
      logger.error("❌ Incoming message بدون tenantId → تم تجاهلها");
      return;
    }

    // 🟢 ضمان وجود contact مربوط بالـ tenant
    const contact = await Contact.findOneAndUpdate(
      { phone, tenantId },
      {
        $setOnInsert: {
          phone,
          name: msg.contactName || msg._data?.notifyName || phone,
          stage: "lead",
          whatsappFirstSeen: new Date(),
          tenantId,
        },
        $set: { last_seen: new Date() },
      },
      { upsert: true, new: true }
    );

    // 🔵 لو الرسالة نصية → نحفظها
    if (msg.body && typeof msg.body === "string" && msg.body.trim()) {
      const savedMessage = await Message.create({
        tenantId,
        contactId: contact._id,
        body: msg.body,
        direction: "in",
        type: msg.type || "text",
        createdAt: msg.timestamp ? new Date(msg.timestamp * 1000) : new Date(),
        meta: {
          waMessageId: msg.id?.id,
          from: msg.from,
          to: msg.to,
          ack: msg.ack,
          hasMedia: msg.hasMedia,
        },
      });

      io.to(`tenant:${tenantId}`).emit("msg:new", { ...savedMessage.toObject(), tenantId });
      logger.info(`[worker] 💬 Saved message for ${contact.phone} (tenant ${tenantId})`);
    } else {
      logger.info(
        `[worker] 📌 Contact ${contact.phone} recorded without text message (tenant ${tenantId})`
      );
    }
  } catch (err) {
    if (err.code === 11000) {
      logger.warn(`[worker] Duplicate message skipped: ${msg.id?.id}`);
    } else {
      logger.error("[worker] Error processing message", { err: err.message });
    }
  }
}

// =======================
// بدء الـ Worker
// =======================
async function startWorker() {
  await connectDB(process.env.MONGO_URI);

  socket.on("connect", () => logger.info("✅ Worker connected to Socket.io server"));
  socket.on("disconnect", (reason) =>
    logger.warn("⚠️ Worker disconnected from Socket.io server", { reason })
  );

  try {
    const connection = await amqp.connect(RABBITMQ_URL);
    const channel = await connection.createChannel();
    await channel.assertQueue(QUEUE_NAME, { durable: true });
    channel.prefetch(1);

    logger.info("[*] Worker is waiting for messages from RabbitMQ...");

    channel.consume(QUEUE_NAME, async (msg) => {
      if (msg !== null) {
        const messageObject = JSON.parse(msg.content.toString());
        await processIncomingMessage(messageObject, socket || mockIo);
        channel.ack(msg);
      }
    });
  } catch (error) {
    logger.error("❌ Worker failed to connect to RabbitMQ, retrying in 5s...", {
      err: error.message,
    });
    setTimeout(startWorker, 5000);
  }
}

startWorker();
