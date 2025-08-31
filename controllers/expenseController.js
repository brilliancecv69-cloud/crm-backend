const Expense = require("../models/Expense");

function ok(res, data, code = 200) { return res.status(code).json({ ok: true, data }); }
function fail(res, error, code = 400) { return res.status(code).json({ ok: false, error }); }

// Create new expense
exports.create = async (req, res) => {
  try {
    const expense = await Expense.create({ ...req.body, tenantId: req.user.tenantId });
    return ok(res, expense, 201);
  } catch (err) {
    return fail(res, err.message, 400);
  }
};

// Get all expenses (with pagination & filters)
exports.list = async (req, res) => {
  try {
    const { page = 1, limit = 20, q } = req.query;
    const filter = { tenantId: req.user.tenantId };
    if (q) {
      const regex = new RegExp(q, "i");
      filter.$or = [{ title: regex }, { category: regex }, { notes: regex }];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [items, total] = await Promise.all([
      Expense.find(filter).sort({ date: -1 }).skip(skip).limit(parseInt(limit)).lean(),
      Expense.countDocuments(filter),
    ]);

    return ok(res, { items, total, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    return fail(res, err.message, 500);
  }
};

// Get one expense
exports.getOne = async (req, res) => {
  try {
    const expense = await Expense.findOne({ _id: req.params.id, tenantId: req.user.tenantId });
    if (!expense) return fail(res, "Expense not found", 404);
    return ok(res, expense);
  } catch (err) {
    return fail(res, err.message, 500);
  }
};

// Update expense
exports.update = async (req, res) => {
  try {
    const expense = await Expense.findOneAndUpdate(
      { _id: req.params.id, tenantId: req.user.tenantId },
      req.body,
      { new: true, runValidators: true }
    );
    if (!expense) return fail(res, "Expense not found", 404);
    return ok(res, expense);
  } catch (err) {
    return fail(res, err.message, 400);
  }
};

// Delete expense
exports.remove = async (req, res) => {
  try {
    const expense = await Expense.findOneAndDelete({
      _id: req.params.id,
      tenantId: req.user.tenantId,
    });
    if (!expense) return fail(res, "Expense not found", 404);
    return ok(res, { message: "Expense deleted" });
  } catch (err) {
    return fail(res, err.message, 500);
  }
};
