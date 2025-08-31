// crm-frontend/backend/run-backfill.js
require("dotenv").config();
const { Client, LocalAuth } = require("whatsapp-web.js");
const amqp = require("amqplib");
const logger = require("./utils/logger");
const qrcode = require("qrcode-terminal");

const RABBITMQ_URL = process.env.RABBITMQ_URL || "amqp://localhost";
const INCOMING_QUEUE = "whatsapp_incoming_messages";

// 🟢 Backfill: استرجاع رسائل آخر 3 شهور
async function runBackfill() {
  try {
    logger.info("🚀 [Backfill] Starting manual backfill for last 3 months...");

    // 1) افتح اتصال RabbitMQ
    const connection = await amqp.connect(RABBITMQ_URL);
    const channel = await connection.createChannel();
    await channel.assertQueue(INCOMING_QUEUE, { durable: true });

    // 2) أنشئ واتساب Client مستقل (بجلسة جديدة crm-backfill)
    const client = new Client({
      authStrategy: new LocalAuth({ clientId: "crm-backfill" }),
      puppeteer: { headless: true, args: ["--no-sandbox"] },
    });

    // 🔵 اطبع QR في التيرمنال
    client.on("qr", (qr) => {
      qrcode.generate(qr, { small: true });
      logger.info("📲 [Backfill] Scan the QR above with WhatsApp.");
    });

    client.on("ready", async () => {
      logger.info("✅ [Backfill] WhatsApp client ready");

      const THREE_MONTHS_AGO = Math.floor(
        (Date.now() - 90 * 24 * 60 * 60 * 1000) / 1000
      );
      const chats = await client.getChats();
      logger.info(`[Backfill] Found ${chats.length} chats to scan.`);

      let queued = 0;

      for (const chat of chats) {
        if (chat.isGroup) continue;

        const phone = chat.id.user;
        const messages = await chat.fetchMessages({ limit: 200 });

        for (const msg of messages) {
          if (msg.timestamp >= THREE_MONTHS_AGO) {
            try {
              const messageBuffer = Buffer.from(JSON.stringify(msg));
              channel.sendToQueue(INCOMING_QUEUE, messageBuffer, {
                persistent: true,
              });
              queued++;
            } catch (err) {
              logger.error(`[Backfill] Failed to enqueue message ${msg.id.id}`, {
                err: err.message,
              });
            }
          }
        }

        // 🟢 حتى لو مفيش رسائل حديثة → نضمن إضافة الرقم كـ Contact
        try {
          const dummyMsg = {
            id: { id: `dummy-${phone}-${Date.now()}` },
            from: `${phone}@c.us`,
            body: "",
            timestamp: Date.now() / 1000,
            _data: { notifyName: chat.name || phone },
          };
          const buffer = Buffer.from(JSON.stringify(dummyMsg));
          channel.sendToQueue(INCOMING_QUEUE, buffer, { persistent: true });
        } catch (err) {
          logger.error(`[Backfill] Failed to enqueue dummy contact for ${phone}`, {
            err: err.message,
          });
        }
      }

      logger.info(
        `🎯 [Backfill] Done. Queued ${queued} messages + ensured contacts.`
      );
      await client.destroy();
      process.exit(0);
    });

    client.on("disconnected", (reason) => {
      logger.warn("[Backfill] WhatsApp client disconnected", { reason });
    });

    client.initialize();
  } catch (err) {
    logger.error("❌ [Backfill] Error during backfill", { err: err.message });
    process.exit(1);
  }
}

runBackfill();
