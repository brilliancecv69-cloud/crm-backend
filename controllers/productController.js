const Product = require("../models/Product");

// GET /api/products
exports.getProducts = async (req, res) => {
  try {
    const { q, category, lowStock } = req.query;
    const filter = { tenantId: req.user.tenantId };

    if (q) {
      filter.$or = [
        { name: new RegExp(q, "i") },
        { sku: new RegExp(q, "i") }
      ];
    }

    if (category) filter.category = category;
    if (lowStock) filter.stockQty = { $lt: "$minQty" };

    const products = await Product.find(filter).sort({ updatedAt: -1 });
    res.json({ ok: true, data: products });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
};

// GET /api/products/:id
exports.getProduct = async (req, res) => {
  try {
    const product = await Product.findOne({ _id: req.params.id, tenantId: req.user.tenantId });
    if (!product) return res.status(404).json({ ok: false, error: "Not found" });
    res.json({ ok: true, data: product });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
};

// POST /api/products
exports.createProduct = async (req, res) => {
  try {
    const product = await Product.create({ ...req.body, tenantId: req.user.tenantId });
    res.status(201).json({ ok: true, data: product });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
};

// PATCH /api/products/:id
exports.updateProduct = async (req, res) => {
  try {
    const product = await Product.findOneAndUpdate(
      { _id: req.params.id, tenantId: req.user.tenantId },
      req.body,
      { new: true, runValidators: true }
    );
    if (!product) return res.status(404).json({ ok: false, error: "Not found" });
    res.json({ ok: true, data: product });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
};

// PATCH /api/products/:id/stock
exports.adjustStock = async (req, res) => {
  try {
    const { delta, note } = req.body; // delta = +10 أو -5
    const product = await Product.findOne({ _id: req.params.id, tenantId: req.user.tenantId });
    if (!product) return res.status(404).json({ ok: false, error: "Not found" });

    product.stockQty += delta;
    product.notes = product.notes
      ? product.notes + `\n[${new Date().toISOString()}] ${note || ""}`
      : `[${new Date().toISOString()}] ${note || ""}`;

    await product.save();
    res.json({ ok: true, data: product });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
};
