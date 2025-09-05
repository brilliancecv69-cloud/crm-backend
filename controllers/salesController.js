const Joi = require("joi");
const Sale = require("../models/Sale");
const Contact = require("../models/Contact");
const asyncHandler = require("../middlewares/asyncHandler");

// --- ✅ Schema for Shipping Details (reusable) ---
const shippingDetailsSchema = Joi.object({
    company: Joi.string().hex().length(24).allow(null, ''), // ObjectId for ShippingCompany
    trackingNumber: Joi.string().trim().allow(null, ''),
    cost: Joi.number().min(0).default(0),
    address: Joi.object({
      governorate: Joi.string().trim().allow(null, ''),
      city: Joi.string().trim().allow(null, ''),
      street: Joi.string().trim().allow(null, ''),
    }).optional(),
    status: Joi.string().valid('pending', 'processing', 'shipped', 'delivered', 'returned', 'cancelled').default('pending')
});

// ⭐️ Schema for creating a new sale (now includes shipping)
const createSaleSchema = Joi.object({
  title: Joi.string().trim().required(),
  contactId: Joi.string().required(),
  amount: Joi.number().min(0).required(),
  status: Joi.string().valid('new', 'won', 'lost', 'pending').default('new'),
  owner: Joi.string().allow('').optional(),
  expectedClose: Joi.date().allow(null).optional(),
  notes: Joi.string().trim().allow('').optional(),
  shippingDetails: shippingDetailsSchema.optional() // ✅ Shipping details are optional on creation
});

// ⭐️ Schema for updating a sale (now includes shipping)
const updateSaleSchema = Joi.object({
  title: Joi.string().trim(),
  amount: Joi.number().min(0),
  status: Joi.string().valid('new', 'won', 'lost', 'pending'),
  owner: Joi.string().allow('').optional(),
  expectedClose: Joi.date().allow(null).optional(),
  notes: Joi.string().trim().allow('').optional(),
  shippingDetails: shippingDetailsSchema.optional() // ✅ Shipping details are optional on update
}).min(1);


// @desc    List all sales for the tenant
// @route   GET /api/sales
// @access  Private
exports.listSales = asyncHandler(async (req, res) => {
  const sales = await Sale.find({ tenantId: req.user.tenantId })
    .populate('contactId', 'name phone')
    .populate('shippingDetails.company', 'name trackingURL') // ✅ Populate shipping company info
    .sort({ createdAt: -1 })
    .lean();
    
  res.json({ ok: true, data: sales });
});

// @desc    Create a new sale
// @route   POST /api/sales
// @access  Private
exports.createSale = asyncHandler(async (req, res) => {
  const validatedData = await createSaleSchema.validateAsync(req.body);
  const sale = await Sale.create({
    ...validatedData,
    tenantId: req.user.tenantId,
  });
  res.status(201).json({ ok: true, data: sale });
});

// @desc    Update a sale
// @route   PATCH /api/sales/:id
// @access  Private
exports.updateSale = asyncHandler(async (req, res) => {
  const validatedData = await updateSaleSchema.validateAsync(req.body);
  const sale = await Sale.findOneAndUpdate(
    { _id: req.params.id, tenantId: req.user.tenantId },
    validatedData,
    { new: true }
  );
  if (!sale) {
    res.status(404);
    throw new Error("Sale not found");
  }
  res.json({ ok: true, data: sale });
});

// @desc    Delete a sale
// @route   DELETE /api/sales/:id
// @access  Private
exports.deleteSale = asyncHandler(async (req, res) => {
  const sale = await Sale.findOneAndDelete({
    _id: req.params.id,
    tenantId: req.user.tenantId,
  });
  if (!sale) {
    res.status(404);
    throw new Error("Sale not found");
  }
  res.json({ ok: true, data: { message: "Sale deleted successfully" } });
});


// @desc    Create a sale from an existing customer
// @route   POST /api/sales/from-contact/:id
// @access  Private
exports.createFromContact = asyncHandler(async (req, res) => {
  const contact = await Contact.findOne({
    _id: req.params.id,
    tenantId: req.user.tenantId
  });
  if (!contact) {
    res.status(404);
    throw new Error("Contact not found");
  }

  const sale = await Sale.create({
    title: req.body.title || `Deal with ${contact.name || contact.phone}`,
    contactId: contact._id,
    tenantId: req.user.tenantId,
    amount: req.body.amount || 0,
    status: req.body.status || "new",
    owner: req.body.owner || (contact.assignedTo ? String(contact.assignedTo) : null),
    notes: req.body.notes || contact.notes || "",
    // ✅ Include shipping details if provided during creation from contact
    shippingDetails: req.body.shippingDetails || { address: { street: contact.address } }
  });

  // Update contact stage and history
  contact.stage = "sales";
  contact.stageHistory.push({
    from: "customer",
    to: "sales",
    by: req.user.id,
    note: `Converted to sale (saleId: ${sale._id})`,
  });
  await contact.save();

  res.status(201).json({ ok: true, data: sale });
});