const Joi = require("joi");
const FollowUpTemplate = require("../models/FollowUpTemplate");
const asyncHandler = require("../middlewares/asyncHandler");

// Joi validation schema for creating/updating a template
const templateSchema = Joi.object({
  name: Joi.string().trim().required(),
  messages: Joi.array().items(Joi.object({
    delay: Joi.number().min(1).required(), // Delay in hours
    message: Joi.string().trim().required(),
  })).min(1).max(5).required(), // Must have at least 1 message, max 5
});

/**
 * @desc    Create a new follow-up template
 * @route   POST /api/follow-up-templates
 * @access  Admin, Sales
 */
exports.createTemplate = asyncHandler(async (req, res) => {
  const validatedData = await templateSchema.validateAsync(req.body);
  const { tenantId, id: userId } = req.user;

  const template = await FollowUpTemplate.create({
    ...validatedData,
    tenantId,
    createdBy: userId,
  });

  res.status(201).json({ ok: true, data: template });
});

/**
 * @desc    List available follow-up templates
 * @route   GET /api/follow-up-templates
 * @access  Admin, Sales
 */
exports.listTemplates = asyncHandler(async (req, res) => {
  const { tenantId, id: userId, role } = req.user;

  let filter = { tenantId };

  // Sales users see templates created by them OR by any admin in the tenant.
  // Admins see all templates for the tenant.
  if (role === 'sales') {
    const adminsInTenant = await require("../models/User").find({ tenantId, role: 'admin' }).select('_id');
    const adminIds = adminsInTenant.map(admin => admin._id);

    filter.$or = [
      { createdBy: userId },       // Templates created by the sales user
      { createdBy: { $in: adminIds } } // Templates created by any admin
    ];
  }

  const templates = await FollowUpTemplate.find(filter)
    .populate('createdBy', 'name role')
    .sort({ createdAt: -1 });

  res.json({ ok: true, data: templates });
});

/**
 * @desc    Get a single template
 * @route   GET /api/follow-up-templates/:id
 * @access  Admin, Sales
 */
exports.getTemplate = asyncHandler(async (req, res) => {
    const { tenantId } = req.user;
    const template = await FollowUpTemplate.findOne({ _id: req.params.id, tenantId });

    if (!template) {
        res.status(404);
        throw new Error("Template not found");
    }

    res.json({ ok: true, data: template });
});

/**
 * @desc    Update a follow-up template
 * @route   PUT /api/follow-up-templates/:id
 * @access  Admin, Sales (owner)
 */
exports.updateTemplate = asyncHandler(async (req, res) => {
  const validatedData = await templateSchema.validateAsync(req.body);
  const { tenantId, id: userId, role } = req.user;

  const template = await FollowUpTemplate.findOne({ _id: req.params.id, tenantId });

  if (!template) {
    res.status(404);
    throw new Error("Template not found");
  }

  // A user can only update a template if they created it.
  if (String(template.createdBy) !== userId) {
    res.status(403);
    throw new Error("You are not authorized to update this template");
  }

  Object.assign(template, validatedData);
  await template.save();
  
  const populatedTemplate = await template.populate('createdBy', 'name role');
  res.json({ ok: true, data: populatedTemplate });
});

/**
 * @desc    Delete a follow-up template
 * @route   DELETE /api/follow-up-templates/:id
 * @access  Admin, Sales (owner)
 */
exports.deleteTemplate = asyncHandler(async (req, res) => {
  const { tenantId, id: userId, role } = req.user;
  
  const template = await FollowUpTemplate.findOne({ _id: req.params.id, tenantId });

  if (!template) {
    res.status(404);
    throw new Error("Template not found");
  }

  // A user can only delete a template if they created it.
  if (String(template.createdBy) !== userId) {
    res.status(403);
    throw new Error("You are not authorized to delete this template");
  }

  await template.deleteOne();

  res.json({ ok: true, data: { message: "Template deleted successfully" } });
});