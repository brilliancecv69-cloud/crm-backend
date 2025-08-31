require("dotenv").config();
const { Client, LocalAuth } = require("whatsapp-web.js");
const amqp = require("amqplib");
const logger = require("./utils/logger");
const { runGapFill } = require("./services/whatsappService");
const connectDB = require("./config/db");
const qrcode = require("qrcode");
const Contact = require("./models/Contact");
const WhatsAppAccount = require("./models/WhatsAppAccount");
const axios = require("axios");

// ----------------------
// Config
// ----------------------
const { io } = require("socket.io-client");
const SOCKET_ORIGIN = process.env.SOCKET_ORIGIN || "http://localhost:5000"; // للـ socket.io
const API_BASE_URL = process.env.API_BASE_URL || "http://localhost:5000/api"; // للـ REST API

const socketsMap = new Map();
function getSocketForTenant(tenantId) {
  if (socketsMap.has(tenantId)) return socketsMap.get(tenantId);

  const newSocket = io(SOCKET_ORIGIN, {
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 2000,
  });

  newSocket.on("connect", () => {
    logger.info(`✅ Socket connected for tenant ${tenantId}`);
    newSocket.emit("join", { tenantId });
  });

  newSocket.on("disconnect", (reason) => {
    logger.warn(`❌ Socket disconnected for tenant ${tenantId}`, { reason });
  });

  socketsMap.set(tenantId, newSocket);
  return newSocket;
}

// ----------------------
// RabbitMQ Config
// ----------------------
const RABBITMQ_URL = process.env.RABBITMQ_URL || "amqp://localhost";
const INCOMING_QUEUE = "whatsapp_incoming_messages";
const OUTGOING_QUEUE = "whatsapp_outgoing_messages";

let rabbitMQChannel = null;
const clientsMap = new Map();

// Helper → push status to API
async function pushStatusToAPI(payload) {
  try {
    await axios.post(`${API_BASE_URL}/whatsapp/push-status`, payload);
    logger.info(`[PushStatus] tenant ${payload.tenantId} → ${payload.state}`);
  } catch (err) {
    logger.error("❌ pushStatusToAPI failed", { err: err.message });
  }
}

// --- RabbitMQ connection ---
async function connectToRabbitMQ() {
  try {
    const connection = await amqp.connect(RABBITMQ_URL);

    connection.on("error", (err) => {
      logger.error("❌ RabbitMQ connection error", { err: err.message });
    });
    connection.on("close", () => {
      logger.error("❗️ RabbitMQ closed. Reconnecting in 5s...");
      rabbitMQChannel = null;
      setTimeout(connectToRabbitMQ, 5000);
    });

    rabbitMQChannel = await connection.createChannel();
    await rabbitMQChannel.assertQueue(INCOMING_QUEUE, { durable: true });
    await rabbitMQChannel.assertQueue(OUTGOING_QUEUE, { durable: true });

    logger.info("✅ Listener connected to RabbitMQ");
    consumeOutgoingMessages(rabbitMQChannel);
  } catch (error) {
    logger.error("❌ RabbitMQ connect failed", { err: error.message });
    setTimeout(connectToRabbitMQ, 5000);
  }
}

// --- Outgoing messages consumer ---
function consumeOutgoingMessages(channel) {
  logger.info("[*] Waiting for outgoing messages...");
  channel.consume(OUTGOING_QUEUE, async (msg) => {
    if (!msg) return;
    try {
      const task = JSON.parse(msg.content.toString());
      const { phone, text, tenantId } = task;

      const client = clientsMap.get(String(tenantId));
      if (!client) throw new Error("No WhatsApp client for tenant");

      const clientState = await client.getState();
      if (clientState !== "CONNECTED") throw new Error("Client not connected");

      await client.sendMessage(`${phone}@c.us`, text);
      logger.info(`[Listener] SENT message to ${phone} (tenant ${tenantId})`);
      channel.ack(msg);
    } catch (err) {
      logger.error("[Listener] Failed to send message", { err: err.message });
      setTimeout(() => channel.nack(msg), 30000);
    }
  });
}

// --- Sync contacts ---
async function syncAllChatsAsContacts(client, tenantId) {
  try {
    const chats = await client.getChats();
    logger.info(`[Sync] Found ${chats.length} chats for tenant ${tenantId}`);
    for (const chat of chats) {
      if (chat.isGroup) continue;
      const rawPhone = chat.id.user;
      if (!rawPhone) continue;

      const phone = Contact.schema.path("phone").options.set(rawPhone);
      if (!phone) continue;

      const contactName = chat.name || rawPhone;

      await Contact.findOneAndUpdate(
        { phone, tenantId },
        {
          $setOnInsert: {
            phone,
            name: contactName,
            stage: "lead",
            whatsappFirstSeen: new Date(),
            tenantId,
          },
          $set: { last_seen: new Date() },
        },
        { upsert: true, new: true }
      );
    }
  } catch (err) {
    logger.error("[Sync] ❌ Error syncing chats", { err: err.message });
  }
}

// --- Initialize WhatsApp client ---
async function initializeWhatsAppForTenant(waAccount) {
  const client = new Client({
    authStrategy: new LocalAuth({
      clientId: waAccount.sessionName || `tenant-${waAccount.tenantId}`,
    }),
    puppeteer: { headless: true, args: ["--no-sandbox"] },
  });

  const tenantSocket = getSocketForTenant(waAccount.tenantId);

  // QR
  client.on("qr", async (qr) => {
    logger.info(`📲 [Tenant ${waAccount.tenantId}] QR RECEIVED`);
    try {
      const qrDataUrl = await qrcode.toDataURL(qr);
      const payload = {
        ready: false,
        state: "scan",
        qr: qrDataUrl,
        tenantId: waAccount.tenantId,
        lastUpdated: new Date(),
      };
      tenantSocket.emit("wa:status", payload);
      await pushStatusToAPI(payload);
    } catch (err) {
      logger.error("❌ QR generation failed", { err: err.message });
    }
  });

  // Ready
  client.on("ready", async () => {
    logger.info(`✅ [Tenant ${waAccount.tenantId}] Ready!`);
    const payload = {
      ready: true,
      state: "connected",
      tenantId: waAccount.tenantId,
      lastUpdated: new Date(),
    };
    // 🔵 ابعت الحالة الأول قبل أي sync
    tenantSocket.emit("wa:status", payload);
    await pushStatusToAPI(payload);

    // جرب sync/gapfill بعدين، حتى لو وقع ما يعطّلش
    try {
      await WhatsAppAccount.findByIdAndUpdate(waAccount._id, { lastConnected: new Date() });
      await syncAllChatsAsContacts(client, waAccount.tenantId);
      if (rabbitMQChannel) {
        await runGapFill(client, rabbitMQChannel, waAccount.tenantId);
      }
    } catch (err) {
      logger.error(`[Tenant ${waAccount.tenantId}] sync/gapfill failed`, { err: err.message });
    }
  });

  // Disconnected
  client.on("disconnected", (reason) => {
    logger.warn(`⚠️ [Tenant ${waAccount.tenantId}] disconnected`, { reason });
    const payload = {
      ready: false,
      state: "disconnected",
      reason,
      tenantId: waAccount.tenantId,
      lastUpdated: new Date(),
    };
    tenantSocket.emit("wa:status", payload);
    pushStatusToAPI(payload);
  });

  // Messages
  client.on("message", async (msg) => {
    if (!rabbitMQChannel) return;
    try {
      const normalizedMsg = {
        tenantId: waAccount.tenantId,
        from: msg.from,
        to: msg.to,
        body: msg.body,
        id: msg.id,
        timestamp: msg.timestamp,
        type: msg.type,
      };
      rabbitMQChannel.sendToQueue(
        INCOMING_QUEUE,
        Buffer.from(JSON.stringify(normalizedMsg)),
        { persistent: true }
      );
      logger.info(`[Listener] Tenant ${waAccount.tenantId} msg from ${msg.from} enqueued`);
    } catch (error) {
      logger.error("Failed to enqueue incoming message", { err: error.message });
    }
  });

  await client
    .initialize()
    .then(() => logger.info(`[Tenant ${waAccount.tenantId}] 🚀 Client initialized`))
    .catch((err) => logger.error(`[Tenant ${waAccount.tenantId}] ❌ Init failed`, { err }));

  clientsMap.set(String(waAccount.tenantId), client);
}

// --- Start ---
async function start() {
  await connectDB(process.env.MONGO_URI);
  const accounts = await WhatsAppAccount.find({ isActive: true });
  if (!accounts.length) {
    logger.error("❌ No WhatsApp accounts in DB");
    return;
  }
  for (const acc of accounts) {
    await initializeWhatsAppForTenant(acc);
  }
  await connectToRabbitMQ();
}

start();
