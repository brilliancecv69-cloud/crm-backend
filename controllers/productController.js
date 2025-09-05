const Joi = require("joi");
const Product = require("../models/Product");
const asyncHandler = require("../middlewares/asyncHandler");

// ⭐️ Schema للتحقق من صحة بيانات إنشاء منتج جديد
const createProductSchema = Joi.object({
  name: Joi.string().trim().required(),
  sku: Joi.string().trim().required(),
  category: Joi.string().trim().allow("").optional(),
  price: Joi.number().min(0).required(),
  stockQty: Joi.number().integer().min(0).default(0),
  minQty: Joi.number().integer().min(0).default(0),
  notes: Joi.string().trim().allow("").optional(),
});

// ⭐️ Schema لتحديث منتج (كل الحقول اختيارية)
const updateProductSchema = Joi.object({
  name: Joi.string().trim(),
  sku: Joi.string().trim(),
  category: Joi.string().trim().allow(""),
  price: Joi.number().min(0),
  stockQty: Joi.number().integer().min(0),
  minQty: Joi.number().integer().min(0),
  notes: Joi.string().trim().allow(""),
}).min(1); // يجب وجود حقل واحد على الأقل للتحديث

// ⭐️ Schema لتعديل المخزون
const adjustStockSchema = Joi.object({
  delta: Joi.number().required(),
  note: Joi.string().trim().allow("").optional(),
});


// GET /api/products
exports.getProducts = asyncHandler(async (req, res) => {
  const { q, category, lowStock } = req.query;
  const filter = { tenantId: req.user.tenantId };

  if (q) {
    const regex = new RegExp(q, "i");
    filter.$or = [{ name: regex }, { sku: regex }];
  }

  if (category) filter.category = category;
  
  // ⭐️ تم تحسين منطق lowStock ليعمل بشكل صحيح مع Mongoose
  if (lowStock === 'true') {
    filter.$expr = { $lte: ["$stockQty", "$minQty"] };
  }

  const products = await Product.find(filter).sort({ updatedAt: -1 });
  res.json({ ok: true, data: products });
});

// GET /api/products/:id
exports.getProduct = asyncHandler(async (req, res) => {
  const product = await Product.findOne({ _id: req.params.id, tenantId: req.user.tenantId });
  if (!product) return res.status(404).json({ ok: false, error: "Product not found" });
  res.json({ ok: true, data: product });
});

// POST /api/products
exports.createProduct = asyncHandler(async (req, res) => {
  const validatedData = await createProductSchema.validateAsync(req.body);
  
  const product = await Product.create({
    ...validatedData,
    tenantId: req.user.tenantId,
  });

  res.status(201).json({ ok: true, data: product });
});

// PATCH /api/products/:id
exports.updateProduct = asyncHandler(async (req, res) => {
  const validatedData = await updateProductSchema.validateAsync(req.body);

  const product = await Product.findOneAndUpdate(
    { _id: req.params.id, tenantId: req.user.tenantId },
    validatedData,
    { new: true, runValidators: true }
  );

  if (!product) return res.status(404).json({ ok: false, error: "Product not found" });
  res.json({ ok: true, data: product });
});

// PATCH /api/products/:id/stock
exports.adjustStock = asyncHandler(async (req, res) => {
  const { delta, note } = await adjustStockSchema.validateAsync(req.body);

  const product = await Product.findOne({ _id: req.params.id, tenantId: req.user.tenantId });
  if (!product) return res.status(404).json({ ok: false, error: "Product not found" });

  // نستخدم $inc لضمان التحديث بشكل آمن (atomic)
  const updatedProduct = await Product.findByIdAndUpdate(
    req.params.id,
    {
      $inc: { stockQty: delta },
      $set: { 
        notes: (product.notes || "") + `\n[${new Date().toISOString()}] Stock adjusted by ${delta}. Note: ${note || "N/A"}`.trim()
      }
    },
    { new: true }
  );
  
  res.json({ ok: true, data: updatedProduct });
});