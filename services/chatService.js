// crm-frontend/backend/services/chatService.js
const fs = require("fs");
const path = require("path");
const { MessageMedia } = require("whatsapp-web.js");
const logger = require("../utils/logger");
const Message = require("../models/Message");
const Contact = require("../models/Contact");
const Tenant = require("../models/Tenant");
const User = require("../models/User");
const ActiveFollowUp = require("../models/ActiveFollowUp");
const Notification = require("../models/Notification");

const UPLOADS_DIR = path.join(__dirname, "../../uploads");
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

class ChatService {
  constructor(io) {
    this.io = io;
    this.clients = new Map();
  }

  registerClient(tenantId, client) {
    this.clients.set(tenantId, client);
    logger.info(`[ChatService] WhatsApp client registered for tenant ${tenantId}`);
  }

  unregisterClient(tenantId) {
    if (this.clients.has(tenantId)) {
      this.clients.delete(tenantId);
      logger.warn(`[ChatService] WhatsApp client unregistered for tenant ${tenantId}.`);
    }
  }

  // ... (دالة assignLeadRoundRobin تبقى كما هي)
  async assignLeadRoundRobin(tenantId, contact) {
    try {
      const salesUsers = await User.find({
        tenantId: tenantId,
        role: 'sales',
        isActive: true,
      });

      if (salesUsers.length === 0) {
        logger.warn(`[ChatService] No active sales users found for tenant ${tenantId} to assign lead.`);
        await contact.save();
        return;
      }
      
      const updatedTenant = await Tenant.findByIdAndUpdate(
        tenantId,
        { $inc: { 'settings.leadCounter': 1 } },
        { new: false }
      );

      const userIndex = (updatedTenant.settings.leadCounter || 0) % salesUsers.length;
      const assignedUser = salesUsers[userIndex];
      
      contact.assignedTo = assignedUser._id;
      await contact.save();

      logger.info(`[ChatService] Lead ${contact.phone} automatically assigned to ${assignedUser.name} for tenant ${tenantId}`);
      
      this.io.to(`tenant:${tenantId}`).emit("contact:assigned", contact.toObject());

    } catch (error) {
      logger.error(`[ChatService] Error in round-robin assignment for tenant ${tenantId}`, { error: error.message });
      if (!contact.isNew) await contact.save();
    }
  }

  // ... (دالة processAndBroadcastMessage تبقى كما هي)
  async processAndBroadcastMessage(msg, tenantId) {
    if (!msg || !msg.id?.id) {
      logger.warn("[ChatService] Ignoring message with invalid ID.", { msg });
      return;
    }

    try {
      const existingMessage = await Message.findOne({ tenantId, "meta.waMessageId": msg.id.id });
      if (existingMessage && existingMessage.meta?.mediaUrl && !msg.hasMedia) {
        existingMessage.meta.ack = msg.ack;
        await existingMessage.save();
        this.io.to(`tenant:${tenantId}`).emit("msg:new", existingMessage.toObject());
        return;
      }
      
      const messageTimestamp = new Date(msg.timestamp * 1000);
      const contact = await this._handleContactLogic(msg, tenantId, messageTimestamp);
      
      if (!contact) return;

      const normalizedMsg = {
        tenantId,
        contactId: contact._id,
        direction: msg.fromMe ? "out" : "in",
        type: 'text',
        body: msg.body || "",
        createdAt: messageTimestamp,
        meta: { waMessageId: msg.id.id, ack: msg.ack, hasMedia: msg.hasMedia },
      };

      if (msg.hasMedia) {
        await this._handleMedia(msg, normalizedMsg);
      }

      const savedMessage = await Message.findOneAndUpdate(
        { tenantId, "meta.waMessageId": msg.id.id },
        { $set: normalizedMsg },
        { upsert: true, new: true, runValidators: true }
      );

      if (savedMessage) {
        this.io.to(`tenant:${tenantId}`).emit("msg:new", savedMessage.toObject());
      }
    } catch (err) {
      logger.error(`[ChatService] Error processing message ${msg.id?.id}`, { error: err.message, stack: err.stack });
    }
  }
  
  // ... (دالة _handleContactLogic تبقى كما هي)
  async _handleContactLogic(msg, tenantId, messageTimestamp) {
    const rawPhone = msg.fromMe ? msg.to : msg.from;
    const phone = rawPhone.replace("@c.us", "");
    
    let contact = await Contact.findOne({ phone, tenantId });
    const isNewContact = !contact;

    if (isNewContact) {
      contact = new Contact({ phone, tenantId, name: phone, stage: "lead" });
    }
    
    contact.lastMessageTimestamp = messageTimestamp;
    
    if (!msg.fromMe) {
      await this._handleIncomingReply(contact);

      if (isNewContact) {
        const tenant = await Tenant.findById(tenantId);
        if (tenant && tenant.settings.leadDistributionStrategy === 'round-robin') {
          await this.assignLeadRoundRobin(tenantId, contact);
        } else {
          await contact.save();
        }
      } else {
        if (contact.assignedTo) {
          const notificationPayload = {
            contactName: contact.name,
            contactId: contact._id,
            messageBody: (msg.body || 'Media message').substring(0, 50) + '...',
            assignedTo: contact.assignedTo,
          };
          this.io.to(`tenant:${tenantId}`).emit("msg:notification", notificationPayload);
        }
        await contact.save();
      }
    } else {
      await contact.save();
    }
    
    return contact;
  }
  
  // ... (دالة _handleIncomingReply تبقى كما هي)
  async _handleIncomingReply(contact) {
    const stoppedFollowUp = await ActiveFollowUp.findOneAndDelete({ contactId: contact._id });
    if (stoppedFollowUp) {
      logger.info(`[ChatService] Stopped active follow-up for contact ${contact.phone} because they replied.`);
      const notificationPayload = {
        userId: stoppedFollowUp.startedBy,
        text: `Automated follow-up for "${contact.name}" was stopped because they replied.`,
        link: `/contacts/${contact._id}`
      };
      const notification = await Notification.create(notificationPayload);
      this.io.to(`user:${stoppedFollowUp.startedBy}`).emit("new_notification", notification);
    }
  }

  async _handleMedia(msg, normalizedMsg) {
    try {
      const media = await msg.downloadMedia();
      if (!media || !media.mimetype) return;

      const extension = media.mimetype.split("/")[1]?.split("+")[0] || "bin";
      const uniqueName = `${Date.now()}-${media.filename || Math.round(Math.random() * 1e9)}.${extension}`;
      const filePath = path.join(UPLOADS_DIR, uniqueName);
      fs.writeFileSync(filePath, Buffer.from(media.data, "base64"));
      
      // ✅ --- بداية التعديل --- ✅
      const host = process.env.PUBLIC_URL || `http://localhost:${process.env.PORT || 5000}`;
      const secureHost = host.replace(/^http:/, 'https');
      const fileUrl = `${secureHost}/uploads/${uniqueName}`; // ✅ استخدام الرابط الآمن
      // ✅ --- نهاية التعديل --- ✅

      normalizedMsg.meta.mediaUrl = fileUrl;
      normalizedMsg.meta.mediaType = media.mimetype;
      normalizedMsg.meta.fileName = media.filename || uniqueName;

      const mainType = media.mimetype.split("/")[0];
      normalizedMsg.type = ["image", "video", "audio"].includes(mainType) ? mainType : "file";
    } catch (err) {
      logger.error(`[ChatService] Media download failed for msg ${msg.id?.id}`, { error: err.message });
    }
  }
  
  async handleIncomingMessage(msg, tenantId) {
    await this.processAndBroadcastMessage(msg, tenantId);
  }

  // ... (دالة handleOutgoingMessage تبقى كما هي)
  async handleOutgoingMessage(tenantId, contactId, body, mediaInfo = null) {
    logger.info(`[ChatService] Attempting to send message for tenant ${tenantId}.`);
    const client = this.clients.get(tenantId);

    if (!client) {
      logger.error(`[ChatService] SEND_FAIL: Client object not found in chatService's map for tenant ${tenantId}.`);
      throw new Error(`WhatsApp client for tenant ${tenantId} is not connected.`);
    }

    const clientState = await client.getState();
    logger.info(`[ChatService] Client state for tenant ${tenantId} is: ${clientState}`);

    if (clientState !== "CONNECTED") {
      logger.error(`[ChatService] SEND_FAIL: Client state is '${clientState}', not 'CONNECTED'.`);
      throw new Error(`WhatsApp client for tenant ${tenantId} is not connected.`);
    }

    const contact = await Contact.findById(contactId);
    if (!contact || !contact.phone) throw new Error(`Contact not found: ${contactId}`);

    const jid = `${contact.phone}@c.us`;

    if (mediaInfo) {
      if (mediaInfo.path && fs.existsSync(mediaInfo.path)) {
        const media = MessageMedia.fromFilePath(mediaInfo.path);
        await client.sendMessage(jid, media, { caption: body });
      } else {
        throw new Error("Media path is missing or invalid.");
      }
    } else {
      await client.sendMessage(jid, body);
    }
    
    contact.lastMessageTimestamp = new Date();
    await contact.save();

    logger.info(`[ChatService] Send command issued to WhatsApp for ${contact.phone}`);
  }
}

module.exports = ChatService;
