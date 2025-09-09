const Joi = require("joi");
const ActiveFollowUp = require("../models/ActiveFollowUp");
const FollowUpTemplate = require("../models/FollowUpTemplate");
const Contact = require("../models/Contact");
const asyncHandler = require("../middlewares/asyncHandler");

const startFollowUpSchema = Joi.object({
  templateId: Joi.string().hex().length(24).required(),
});

/**
 * @desc    Start an automated follow-up sequence for a contact
 * @route   POST /api/contacts/:contactId/follow-up/start
 * @access  Private (Admin, Sales)
 */
exports.startFollowUp = asyncHandler(async (req, res) => {
  const { contactId } = req.params;
  const { templateId } = await startFollowUpSchema.validateAsync(req.body);
  const { tenantId, id: userId, role } = req.user;

  // 1. Validate that all entities exist and belong to the tenant
  const contact = await Contact.findOne({ _id: contactId, tenantId });
  if (!contact) {
    res.status(404);
    throw new Error("Contact not found");
  }

  const template = await FollowUpTemplate.findOne({ _id: templateId, tenantId });
  if (!template || template.messages.length === 0) {
    res.status(404);
    throw new Error("Template not found or it has no messages");
  }

  // --- Business Logic from our discussion ---
  // A sales user can only use their own templates or templates created by an admin.
  if (role === 'sales') {
      const templateCreator = await require("../models/User").findById(template.createdBy).select('role');
      if (String(template.createdBy) !== userId && templateCreator.role !== 'admin') {
          res.status(403);
          throw new Error("You are not authorized to use this template.");
      }
  }

  // 2. Check if a follow-up is already active for this contact
  const existingFollowUp = await ActiveFollowUp.findOne({ contactId });
  if (existingFollowUp) {
    res.status(409); // 409 Conflict
    throw new Error("A follow-up sequence is already active for this contact.");
  }

  // 3. Calculate the send time for the first message
  const firstStep = template.messages[0];
  const now = new Date();
  const sendAt = new Date(now.getTime() + firstStep.delay * 60 * 60 * 1000); // delay is in hours

  // 4. Create the active follow-up record
  const activeFollowUp = await ActiveFollowUp.create({
    tenantId,
    contactId,
    templateId,
    currentStep: 0, // Start with the first message (index 0)
    sendAt,
    startedBy: userId,
  });

  res.status(201).json({ 
    ok: true, 
    data: { 
        message: "Follow-up sequence started successfully.",
        nextSendTime: sendAt
    } 
  });
});


/**
 * @desc    Stop an automated follow-up sequence for a contact
 * @route   DELETE /api/contacts/:contactId/follow-up/stop
 * @access  Private (Admin, Sales)
 */
exports.stopFollowUp = asyncHandler(async (req, res) => {
    const { contactId } = req.params;
    const { tenantId } = req.user;

    const result = await ActiveFollowUp.findOneAndDelete({ contactId, tenantId });

    if (!result) {
        res.status(404);
        throw new Error("No active follow-up sequence found for this contact.");
    }

    res.json({ ok: true, data: { message: "Follow-up sequence stopped successfully." } });
});