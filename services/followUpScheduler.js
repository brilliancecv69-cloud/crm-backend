const cron = require('node-cron');
const logger = require('../utils/logger');
const ActiveFollowUp = require('../models/ActiveFollowUp');
const FollowUpTemplate = require('../models/FollowUpTemplate');
const Contact = require('../models/Contact');
const mongoose = require('mongoose');

// --- ✅ إضافات جديدة ---
const UserSession = require('../models/UserSession');
const User = require('../models/User');

let chatServiceInstance = null;

// ====================
// Original Follow-up Logic
// ====================
const checkAndSendFollowUps = async () => {
  logger.info('[FollowUpScheduler] Checking for scheduled follow-ups...');
  
  const now = new Date();
  const dueFollowUps = await ActiveFollowUp.find({ sendAt: { $lte: now } })
    .populate('templateId')
    .populate('contactId');

  if (dueFollowUps.length === 0) {
    logger.info('[FollowUpScheduler] No follow-ups are due.');
    return;
  }

  logger.info(`[FollowUpScheduler] Found ${dueFollowUps.length} follow-ups to process.`);

  for (const followUp of dueFollowUps) {
    const { templateId: template, contactId: contact, tenantId } = followUp;

    if (!template || !contact || !chatServiceInstance) {
      logger.warn(`[FollowUpScheduler] Skipping follow-up ${followUp._id} due to missing data.`);
      await ActiveFollowUp.findByIdAndDelete(followUp._id);
      continue;
    }

    const messageToSend = template.messages[followUp.currentStep]?.message;
    if (!messageToSend) {
      logger.warn(`[FollowUpScheduler] Message step ${followUp.currentStep} not found in template ${template._id}. Deleting follow-up.`);
      await ActiveFollowUp.findByIdAndDelete(followUp._id);
      continue;
    }

    try {
      await chatServiceInstance.handleOutgoingMessage(tenantId, contact._id, messageToSend);
      logger.info(`[FollowUpScheduler] Sent follow-up message to ${contact.phone} for tenant ${tenantId}.`);

      const nextStep = followUp.currentStep + 1;
      if (nextStep < template.messages.length) {
        const nextMessageTemplate = template.messages[nextStep];
        const newSendAt = new Date(Date.now() + nextMessageTemplate.delay * 60 * 60 * 1000);
        
        followUp.currentStep = nextStep;
        followUp.sendAt = newSendAt;
        await followUp.save();
        logger.info(`[FollowUpScheduler] Rescheduled next follow-up for contact ${contact.phone} at ${newSendAt}.`);
      } else {
        await ActiveFollowUp.findByIdAndDelete(followUp._id);
        logger.info(`[FollowUpScheduler] Completed follow-up sequence for contact ${contact.phone}.`);
      }

    } catch (error) {
      logger.error(`[FollowUpScheduler] Failed to process follow-up ${followUp._id} for contact ${contact.phone}`, { error: error.message });
    }
  }
};

// ====================
// ✅ New: Idle Users Logic
// ====================
const checkIdleUsers = async (io) => {
  logger.info('[IdleScheduler] Checking for idle users...');
  const now = new Date();
  const idleThreshold = 60 * 60 * 1000; // 1 ساعة

  try {
    const sessions = await UserSession.find({ logoutTime: null });

    for (let session of sessions) {
      if (session.lastActionAt && (now - session.lastActionAt) > idleThreshold && !session.isIdle) {
        session.isIdle = true;
        await session.save();

        await User.findByIdAndUpdate(session.userId, { isIdle: true });

        if (io) {
          io.to(`tenant:${session.tenantId}`).emit("user:idle", {
            userId: session.userId,
            sessionId: session._id,
            at: now
          });
        }

        logger.warn(`[IdleScheduler] User ${session.userId} marked as IDLE (tenant: ${session.tenantId}).`);
      }
    }
  } catch (err) {
    logger.error("[IdleScheduler] Error checking idle users:", err);
  }
};

// ====================
// Initialize Scheduler
// ====================
exports.initializeScheduler = (chatService, io) => {
  if (!chatService) {
    throw new Error("ChatService instance is required to initialize the scheduler.");
  }
  chatServiceInstance = chatService;
  
  // ✅ Follow-ups كل دقيقة
  cron.schedule('* * * * *', checkAndSendFollowUps);

  // ✅ Idle check كل 5 دقايق
  cron.schedule('*/5 * * * *', () => checkIdleUsers(io));

  logger.info('[Scheduler] Follow-Up Scheduler running every minute, Idle Checker every 5 minutes.');
};
