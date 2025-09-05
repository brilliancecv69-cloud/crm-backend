const Joi = require("joi");
const Expense = require("../models/Expense");
const asyncHandler = require("../middlewares/asyncHandler");

// ⭐️ Schema for creating a new expense
const createExpenseSchema = Joi.object({
  title: Joi.string().trim().required(),
  amount: Joi.number().min(0).required(),
  category: Joi.string().trim().allow("").optional(),
  date: Joi.date().optional(),
  notes: Joi.string().trim().allow("").optional(),
});

// ⭐️ Schema for updating an expense (all fields optional)
const updateExpenseSchema = Joi.object({
  title: Joi.string().trim(),
  amount: Joi.number().min(0),
  category: Joi.string().trim().allow(""),
  date: Joi.date(),
  notes: Joi.string().trim().allow(""),
}).min(1); // At least one field is required for an update


// POST /api/expenses -> Create new expense
exports.create = asyncHandler(async (req, res) => {
  const validatedData = await createExpenseSchema.validateAsync(req.body);
  const expense = await Expense.create({
    ...validatedData,
    tenantId: req.user.tenantId,
  });
  res.status(201).json({ ok: true, data: expense });
});

// GET /api/expenses -> Get all expenses (with pagination & filters)
exports.list = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, q } = req.query;
  const filter = { tenantId: req.user.tenantId };
  if (q) {
    const regex = new RegExp(q, "i");
    filter.$or = [{ title: regex }, { category: regex }, { notes: regex }];
  }

  const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);

  const [items, total] = await Promise.all([
    Expense.find(filter)
      .sort({ date: -1 })
      .skip(skip)
      .limit(parseInt(limit, 10))
      .lean(),
    Expense.countDocuments(filter),
  ]);

  res.json({
    ok: true,
    data: { items, total, page: parseInt(page, 10), limit: parseInt(limit, 10) },
  });
});

// GET /api/expenses/:id -> Get one expense
exports.getOne = asyncHandler(async (req, res) => {
  const expense = await Expense.findOne({
    _id: req.params.id,
    tenantId: req.user.tenantId,
  });
  if (!expense) {
    res.status(404);
    throw new Error("Expense not found");
  }
  res.json({ ok: true, data: expense });
});

// PATCH /api/expenses/:id -> Update expense
exports.update = asyncHandler(async (req, res) => {
  const validatedData = await updateExpenseSchema.validateAsync(req.body);
  const expense = await Expense.findOneAndUpdate(
    { _id: req.params.id, tenantId: req.user.tenantId },
    validatedData,
    { new: true, runValidators: true }
  );
  if (!expense) {
    res.status(404);
    throw new Error("Expense not found");
  }
  res.json({ ok: true, data: expense });
});

// DELETE /api/expenses/:id -> Delete expense
exports.remove = asyncHandler(async (req, res) => {
  const expense = await Expense.findOneAndDelete({
    _id: req.params.id,
    tenantId: req.user.tenantId,
  });
  if (!expense) {
    res.status(404);
    throw new Error("Expense not found");
  }
  res.json({ ok: true, data: { message: "Expense deleted successfully" } });
});