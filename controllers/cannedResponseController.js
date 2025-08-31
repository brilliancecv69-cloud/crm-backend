const CannedResponse = require("../models/CannedResponse");

// Helpers
const ok = (res, data, code = 200) => res.status(code).json({ ok: true, data });
const fail = (res, error, code = 400) => res.status(code).json({ ok: false, error });

/**
 * Get all canned responses
 */
exports.list = async (req, res) => {
  try {
    const responses = await CannedResponse.find({ tenantId: req.user.tenantId })
      .sort({ title: 1 })
      .lean();
    return ok(res, responses);
  } catch (err) {
    return fail(res, err.message, 500);
  }
};

/**
 * Create new canned response
 */
exports.create = async (req, res) => {
  try {
    const { title, text } = req.body;
    if (!title || !text) {
      return fail(res, "Title and text are required");
    }
    const newResponse = await CannedResponse.create({
      tenantId: req.user.tenantId,
      title,
      text,
    });
    return ok(res, newResponse, 201);
  } catch (err) {
    return fail(res, err.message, 500);
  }
};

/**
 * Update canned response
 */
exports.update = async (req, res) => {
  try {
    const { title, text } = req.body;
    const updatedResponse = await CannedResponse.findOneAndUpdate(
      { _id: req.params.id, tenantId: req.user.tenantId },
      { title, text },
      { new: true, runValidators: true }
    );
    if (!updatedResponse) {
      return fail(res, "Response not found", 404);
    }
    return ok(res, updatedResponse);
  } catch (err) {
    return fail(res, err.message, 500);
  }
};

/**
 * Delete canned response
 */
exports.remove = async (req, res) => {
  try {
    const deletedResponse = await CannedResponse.findOneAndDelete({
      _id: req.params.id,
      tenantId: req.user.tenantId,
    });
    if (!deletedResponse) {
      return fail(res, "Response not found", 404);
    }
    return ok(res, { message: "Response deleted successfully" });
  } catch (err) {
    return fail(res, err.message, 500);
  }
};
