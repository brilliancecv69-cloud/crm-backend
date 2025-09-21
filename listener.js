// crm-frontend/backend/listener.js
const { Client, LocalAuth } = require("whatsapp-web.js");
const qrcode = require("qrcode");
const path = require("path");
const fs = require("fs-extra");
const logger = require("./utils/logger");
const WhatsAppAccount = require("./models/WhatsAppAccount");
const { runGapFill } = require("./services/whatsappService");
const amqp = require("amqplib");

class WhatsAppInstanceManager {
  constructor(io, statusCache, chatService) {
    this.clients = new Map();
    this.io = io;
    this.statusCache = statusCache;
    this.chatService = chatService;
    logger.info("[Manager] WhatsApp Instance Manager initialized.");
  }

  async startClient(tenantId) {
    if (this.clients.has(tenantId)) {
      logger.warn(`[Manager] Client for tenant ${tenantId} is already running.`);
      return;
    }

    const waAccount = await WhatsAppAccount.findOne({ tenantId, isActive: true });
    if (!waAccount) {
      logger.error(`[Manager] No active WhatsApp account found for tenant ${tenantId}.`);
      this.updateStatus(tenantId, { state: "not_configured" });
      return;
    }

    logger.info(`[Manager] Initializing WhatsApp for tenant: ${tenantId}`);
    const client = this.createClient(tenantId);
    this.clients.set(tenantId, client);

    this.initializeAndListen(client, tenantId, waAccount);

    client.initialize().catch(err => {
      logger.error(`[Manager] CRITICAL: Failed to initialize client for tenant ${tenantId}`, { error: err.message });
      this.updateStatus(tenantId, { state: "error", error: "Initialization failed." });
      this.clients.delete(tenantId);
    });
  }

  createClient(tenantId) {
    return new Client({
      authStrategy: new LocalAuth({ clientId: `tenant-${tenantId}` }),
      puppeteer: { headless: true, args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"] }, // Added disable-dev-shm-usage for stability in some environments
      webVersionCache: {
        type: 'remote',
        remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html',
      },
    });
  }

  initializeAndListen(client, tenantId, waAccount) {
    this.updateStatus(tenantId, { state: "initializing" });
    
    // ✅ --- START OF DETAILED LOGGING --- ✅

    client.on("loading_screen", (percent, message) => {
        logger.info(`[Manager] ⏳ Tenant ${tenantId} Loading: ${percent}% - ${message}`);
    });

    client.on("qr", async (qr) => {
        const qrDataUrl = await qrcode.toDataURL(qr);
        logger.info(`[Manager] 📲 Tenant ${tenantId} QR Code Received. Waiting for scan.`);
        this.updateStatus(tenantId, { state: "scan", qr: qrDataUrl });
    });

    client.on('authenticated', () => {
        logger.info(`[Manager] 🔐 Tenant ${tenantId} Authenticated Successfully.`);
        this.updateStatus(tenantId, { state: "authenticated", message: "Authenticated. Initializing chat..." });
    });

    client.on('auth_failure', (msg) => {
        logger.error(`[Manager] ❌ CRITICAL: Tenant ${tenantId} Authentication Failure: ${msg}`);
        this.updateStatus(tenantId, { state: "auth_failure", message: `Authentication failed: ${msg}` });
    });

    client.on("ready", async () => {
        const state = await client.getState();
        logger.info(`[Manager] ✅ SUCCESS: Client is READY for tenant ${tenantId}. State: ${state}. Registering with ChatService.`);
        this.chatService.registerClient(tenantId, client);
        this.updateStatus(tenantId, { state: "connected", qr: null });

        try {
            logger.info(`[GapFill] Starting gap fill process for tenant ${tenantId}...`);
            const connection = await amqp.connect(process.env.RABBITMQ_URL || "amqp://localhost");
            const channel = await connection.createChannel();
            await channel.assertQueue("whatsapp_incoming_messages", { durable: true });
            await runGapFill(client, channel, tenantId);
            await channel.close();
            await connection.close();
            logger.info(`[GapFill] Process finished for tenant ${tenantId}.`);
        } catch (err) {
            logger.error(`[GapFill] Failed to run gap fill for tenant ${tenantId}`, { error: err.message });
        }
    });
    
    client.on("disconnected", async (reason) => {
        logger.warn(`[Manager] ⚠️ Client DISCONNECTED for tenant ${tenantId}. Reason: ${reason}`);
        this.chatService.unregisterClient(tenantId);
        this.updateStatus(tenantId, { state: "disconnected", message: `Connection lost: ${reason}` });
    });

    client.on('change_state', state => {
        logger.info(`[Manager] ℹ️ Tenant ${tenantId} state changed to: ${state.toUpperCase()}`);
    });

    client.on('remote_session_saved', () => {
        logger.info(`[Manager] 💾 Remote session saved for tenant ${tenantId}.`);
    });
    
    // ✅ --- END OF DETAILED LOGGING --- ✅

    client.on("message", (msg) => this.chatService.handleIncomingMessage(msg, tenantId));
    
    client.on("message_create", (msg) => {
        if (msg.fromMe) this.chatService.handleIncomingMessage(msg, tenantId);
    });
  }
  
  async stopClient(tenantId) {
    const client = this.clients.get(tenantId);
    if (client) {
      try {
        await client.destroy();
        logger.info(`[Manager] Client for tenant ${tenantId} has been destroyed.`);
      } catch (err) {
        logger.error(`[Manager] Error destroying client for ${tenantId}:`, err);
      }
      this.clients.delete(tenantId);
      if (this.chatService.unregisterClient) {
        this.chatService.unregisterClient(tenantId);
      }
      this.updateStatus(tenantId, { state: "disconnected" });
    }
  }
  
  async logoutClient(tenantId) {
    await this.stopClient(tenantId);
    // Corrected path for LocalAuth strategy
    const sessionPath = path.join(__dirname, '..', `.wwebjs_auth/session-tenant-${tenantId}`);
    try {
      await fs.remove(sessionPath);
      logger.info(`[Manager] Session data for tenant ${tenantId} removed from path: ${sessionPath}`);
      this.updateStatus(tenantId, { state: "logged_out" });
    } catch (err) {
      logger.error(`[Manager] Error removing session data for ${tenantId}:`, err);
    }
  }

  updateStatus(tenantId, payload) {
    const fullPayload = {
      ...this.statusCache.get(tenantId),
      ready: payload.state === "connected",
      tenantId,
      ...payload,
      timestamp: new Date().toISOString(),
    };
    this.statusCache.set(tenantId, fullPayload);
    this.io.to(`tenant:${tenantId}`).emit("wa:status", fullPayload);
    logger.info(`[Status Update] Tenant ${tenantId} is now '${fullPayload.state.toUpperCase()}'`);
  }
}

let instance = null;

function initializeManager(io, statusCache, chatService) {
  if (!instance) {
    instance = new WhatsAppInstanceManager(io, statusCache, chatService);
  }
  return instance;
}

function getManager() {
  if (!instance) {
    throw new Error("WhatsAppInstanceManager has not been initialized yet.");
  }
  return instance;
}

module.exports = { initializeManager, getManager };
