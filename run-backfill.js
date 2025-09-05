// crm-frontend/backend/run-backfill.js
require("dotenv").config();
const { Client, LocalAuth } = require("whatsapp-web.js");
const amqp = require("amqplib");
const logger = require("./utils/logger");
const qrcode = require("qrcode-terminal");
const fs = require("fs");
const path = require("path");

const RABBITMQ_URL = process.env.RABBITMQ_URL || "amqp://localhost";
const INCOMING_QUEUE = "whatsapp_incoming_messages";
const UPLOADS_DIR = path.join(__dirname, "../uploads");

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

async function runBackfill() {
  try {
    logger.info("🚀 [Backfill] Starting...");
    const connection = await amqp.connect(RABBITMQ_URL);
    const channel = await connection.createChannel();
    await channel.assertQueue(INCOMING_QUEUE, { durable: true });

    const client = new Client({
      authStrategy: new LocalAuth({ clientId: "crm-backfill" }),
      puppeteer: { headless: true, args: ["--no-sandbox"] },
    });

    client.on("qr", (qr) => qrcode.generate(qr, { small: true }));

    client.on("ready", async () => {
      logger.info("✅ [Backfill] WhatsApp client ready.");
      const tenantId = process.env.BACKFILL_TENANT_ID;
      const chats = await client.getChats();
      let queued = 0;

      for (const chat of chats) {
        if (chat.isGroup) continue;

        const messages = await chat.fetchMessages({ limit: 1000 }); // زيادة الحد لجلب أكبر عدد ممكن
        for (const msg of messages) {
          try {
            const payload = {
              tenantId,
              id: msg.id,
              from: msg.from,
              to: msg.to,
              body: msg.body,
              timestamp: msg.timestamp,
              type: msg.type,
              fromMe: msg.fromMe,
              direction: msg.fromMe ? "out" : "in",
              hasMedia: msg.hasMedia,
              ack: msg.ack,
              meta: {},
            };

            if (msg.hasMedia) {
              const media = await msg.downloadMedia();
              if (media && media.mimetype) {
                const extension = media.mimetype.split("/")[1]?.split("+")[0] || "bin";
                const uniqueName = `backfill-${Date.now()}-${Math.round(Math.random() * 1e9)}.${extension}`;
                const filePath = path.join(UPLOADS_DIR, uniqueName);
                fs.writeFileSync(filePath, Buffer.from(media.data, "base64"));
                const host = process.env.PUBLIC_URL || "http://localhost:5000";
                
                payload.meta.mediaUrl = `${host}/uploads/${uniqueName}`;
                payload.meta.mediaType = media.mimetype;
                payload.meta.fileName = media.filename || uniqueName;
              }
            }
            
            channel.sendToQueue(INCOMING_QUEUE, Buffer.from(JSON.stringify(payload)));
            queued++;
          } catch(e) {
            logger.error(`Failed to process message ${msg.id.id}`, e);
          }
        }
      }
      logger.info(`🎯 [Backfill] Done. Queued ${queued} messages.`);
      
      setTimeout(async () => {
        await client.destroy();
        await connection.close();
        process.exit(0);
      }, 5000);
    });

    client.initialize();
  } catch (err) {
    logger.error("❌ [Backfill] Error", { err: err.message });
    process.exit(1);
  }
}

runBackfill();