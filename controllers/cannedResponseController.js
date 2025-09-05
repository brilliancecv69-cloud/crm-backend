const Joi = require("joi");
const CannedResponse = require("../models/CannedResponse");
const asyncHandler = require("../middlewares/asyncHandler");

// ⭐️ Schema to validate canned response data
const cannedResponseSchema = Joi.object({
  title: Joi.string().trim().required(),
  text: Joi.string().trim().required(),
});

/**
 * @desc    Get all canned responses for a tenant
 * @route   GET /api/canned-responses
 * @access  Private
 */
exports.list = asyncHandler(async (req, res) => {
  const responses = await CannedResponse.find({ tenantId: req.user.tenantId })
    .sort({ title: 1 })
    .lean();
  res.json({ ok: true, data: responses });
});

/**
 * @desc    Create new canned response
 * @route   POST /api/canned-responses
 * @access  Private
 */
exports.create = asyncHandler(async (req, res) => {
  const validatedData = await cannedResponseSchema.validateAsync(req.body);

  const newResponse = await CannedResponse.create({
    ...validatedData,
    tenantId: req.user.tenantId,
  });

  res.status(201).json({ ok: true, data: newResponse });
});

/**
 * @desc    Update a canned response
 * @route   PATCH /api/canned-responses/:id
 * @access  Private
 */
exports.update = asyncHandler(async (req, res) => {
  const validatedData = await cannedResponseSchema.validateAsync(req.body);

  const updatedResponse = await CannedResponse.findOneAndUpdate(
    { _id: req.params.id, tenantId: req.user.tenantId },
    validatedData,
    { new: true, runValidators: true }
  );

  if (!updatedResponse) {
    res.status(404);
    throw new Error("Canned response not found");
  }

  res.json({ ok: true, data: updatedResponse });
});

/**
 * @desc    Delete a canned response
 * @route   DELETE /api/canned-responses/:id
 * @access  Private
 */
exports.remove = asyncHandler(async (req, res) => {
  const deletedResponse = await CannedResponse.findOneAndDelete({
    _id: req.params.id,
    tenantId: req.user.tenantId,
  });

  if (!deletedResponse) {
    res.status(404);
    throw new Error("Canned response not found");
  }

  res.json({ ok: true, data: { message: "Response deleted successfully" } });
});