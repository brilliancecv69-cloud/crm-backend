const Joi = require("joi");
const Contact = require("../models/Contact");
const Product = require("../models/Product");
const User = require("../models/User");
const Notification = require("../models/Notification");
const Tenant = require("../models/Tenant");
const asyncHandler = require("../middlewares/asyncHandler");
// --- ✅ START: NEW MODEL IMPORTED ---
const ActiveFollowUp = require("../models/ActiveFollowUp");
// --- ✅ END: NEW MODEL IMPORTED ---


// Schemas for validation
const contactUpsertSchema = Joi.object({
  phone: Joi.string().trim().required(),
  name: Joi.string().trim().allow("").optional(),
  email: Joi.string().trim().email({ tlds: { allow: false } }).allow("").optional(),
  address: Joi.string().trim().allow("").optional(),
  notes: Joi.string().trim().allow("").optional(),
});

const contactUpdateSchema = Joi.object({
    name: Joi.string().trim().allow(""),
    email: Joi.string().email({ tlds: { allow: false } }).allow(""),
    address: Joi.string().trim().allow(""),
    notes: Joi.string().trim().allow(""),
    salesData: Joi.object({
        pipeline_status: Joi.string(),
        amount: Joi.number(),
        probability: Joi.number(),
        shippingDetails: Joi.object({
            company: Joi.string().hex().length(24).allow(null, ''),
            trackingNumber: Joi.string().trim().allow(null, ''),
            cost: Joi.number().min(0).allow(''),
            address: Joi.object({
                governorate: Joi.string().trim().allow(null, ''),
                city: Joi.string().trim().allow(null, ''),
                street: Joi.string().trim().allow(null, ''),
            }),
            status: Joi.string().valid('pending', 'processing', 'shipped', 'delivered', 'returned', 'cancelled')
        })
    }),
    products: Joi.array().items(Joi.object({
        productId: Joi.string().required(),
        qty: Joi.number().min(1).required(),
        price: Joi.number().min(0).required(),
    })),
}).min(1);

const stageSchema = Joi.object({
    stage: Joi.string().valid('lead', 'customer', 'sales').required(),
});

const assignSchema = Joi.object({
    userId: Joi.string().required(),
});

// Helper to send notifications
async function createAndNotify(req, userId, text, link) {
  try {
    const notification = await Notification.create({
      tenantId: req.user.tenantId,
      userId,
      text,
      link,
    });
    const io = req.app.get("io");
    io.to(`user:${userId}`).emit("new_notification", notification);
  } catch (error) {
    console.error("Failed to create notification:", error);
  }
}

// Database-driven round-robin assignment
async function pickSalesUser(tenantId) {
  const salesUsers = await User.find({ tenantId, role: "sales" }).sort({ _id: 1 }).lean();
  if (!salesUsers.length) return null;

  const tenant = await Tenant.findByIdAndUpdate(
    tenantId,
    { $inc: { "settings.leadCounter": 1 } },
    { new: true, upsert: true }
  );

  const currentIndex = (tenant.settings.leadCounter || 0) % salesUsers.length;
  return salesUsers[currentIndex];
}

// POST /api/contacts -> Create or Update a contact (Upsert)
exports.createOrUpdate = asyncHandler(async (req, res) => {
  const { phone, ...rest } = await contactUpsertSchema.validateAsync(req.body);
  const { tenantId } = req.user;

  let contact = await Contact.findOne({ phone, tenantId });

  if (!contact) {
    const assignedUser = await pickSalesUser(tenantId);
    contact = new Contact({
      phone,
      ...rest,
      stage: "lead",
      tenantId,
      assignedTo: assignedUser ? assignedUser._id : null,
    });
    await contact.save();

    if (assignedUser) {
      await createAndNotify(
        req,
        assignedUser._id,
        `You have a new lead: ${contact.name || contact.phone}`,
        `/contacts/${contact._id}`
      );
    }
  } else {
    Object.assign(contact, rest);
    await contact.save();
  }

  const populatedContact = await contact.populate([
    { path: 'products.productId', select: 'name price category' },
    { path: 'assignedTo', select: 'name email' }
  ]);

  res.status(contact.isNew ? 201 : 200).json({ ok: true, data: populatedContact });
});

// GET /api/contacts/:id -> Get one contact
exports.getOne = asyncHandler(async (req, res) => {
  const contact = await Contact.findOne({
    _id: req.params.id,
    tenantId: req.user.tenantId,
  })
    .populate("products.productId", "name price category")
    .populate("assignedTo", "name email");

  if (!contact) {
    res.status(404);
    throw new Error("Contact not found");
  }
  res.json({ ok: true, data: contact });
});

// GET /api/contacts -> List contacts with filters
exports.list = asyncHandler(async (req, res) => {
    const {
      stage, q, pipeline_status, isArchived,
      page = 1, limit = 20, sortBy, order = "desc",
      from, to
    } = req.query;

    const filter = { tenantId: req.user.tenantId };
    if (stage) filter.stage = stage;
    if (pipeline_status) filter["salesData.pipeline_status"] = pipeline_status;
    if (isArchived === "true") filter.isArchived = true;
    else if (isArchived === "false") filter.isArchived = { $ne: true };

    if (q) {
      const searchRegex = new RegExp(q, "i");
      filter.$or = [
        { name: searchRegex },
        { phone: searchRegex },
        { email: searchRegex },
        { notes: searchRegex },
      ];
    }
    
    if (from || to) {
      filter.createdAt = {};
      if (from) filter.createdAt.$gte = new Date(from);
      if (to) {
        const endDate = new Date(to);
        endDate.setHours(23, 59, 59, 999);
        filter.createdAt.$lte = endDate;
      }
    }
    
    if (req.user.role === 'sales') {
      filter.assignedTo = req.user.id;
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    let sort;
    if (sortBy) {
        sort = { [sortBy]: order === "asc" ? 1 : -1 };
    } else {
        sort = { lastMessageTimestamp: -1, updatedAt: -1 };
    }

    const [items, total] = await Promise.all([
      Contact.find(filter)
        .populate("products.productId", "name price category")
        .populate("assignedTo", "name email")
        .sort(sort).skip(skip).limit(parseInt(limit)).lean(),
      Contact.countDocuments(filter),
    ]);
    
    // --- ✅ START: NEW LOGIC TO ADD FOLLOW-UP STATUS ---
    if (items.length > 0) {
        const contactIds = items.map(c => c._id);
        const activeFollowUps = await ActiveFollowUp.find({ contactId: { $in: contactIds } }).select('contactId').lean();
        const followUpSet = new Set(activeFollowUps.map(f => f.contactId.toString()));
        
        const itemsWithStatus = items.map(item => ({
            ...item,
            hasActiveFollowUp: followUpSet.has(item._id.toString())
        }));

        return res.json({ ok: true, data: { items: itemsWithStatus, total, page: parseInt(page), limit: parseInt(limit) } });
    }
    // --- ✅ END: NEW LOGIC ---

    res.json({ ok: true, data: { items, total, page: parseInt(page), limit: parseInt(limit) } });
});

// PATCH /api/contacts/:id -> Update a contact
exports.update = asyncHandler(async (req, res) => {
    const validatedData = await contactUpdateSchema.validateAsync(req.body);

    const contact = await Contact.findOne({
      _id: req.params.id,
      tenantId: req.user.tenantId,
    });
    if (!contact) {
        res.status(404);
        throw new Error("Contact not found");
    }

    if (validatedData.salesData) {
        const existingSalesData = contact.salesData ? contact.salesData.toObject() : {};
        const newShippingDetails = validatedData.salesData.shippingDetails
            ? { ...existingSalesData.shippingDetails, ...validatedData.salesData.shippingDetails }
            : existingSalesData.shippingDetails;

        validatedData.salesData = {
            ...existingSalesData,
            ...validatedData.salesData,
            shippingDetails: newShippingDetails
        };
    }

    Object.assign(contact, validatedData);
    await contact.save();
    
    const populated = await contact.populate([
        { path: 'products.productId', select: 'name price category' },
        { path: 'assignedTo', select: 'name email' }
    ]);

    res.json({ ok: true, data: populated });
});

// Manually assign or re-assign a contact
exports.assignContact = asyncHandler(async (req, res) => {
    const { userId } = await assignSchema.validateAsync(req.body);
    const { tenantId } = req.user;

    const [contact, userToAssign] = await Promise.all([
        Contact.findOne({ _id: req.params.id, tenantId }),
        User.findOne({ _id: userId, tenantId, role: 'sales' })
    ]);

    if (!contact) {
        res.status(404);
        throw new Error("Contact not found");
    }
    if (!userToAssign) {
        res.status(404);
        throw new Error("Sales user not found in this tenant");
    }

    const previousAssignee = contact.assignedTo ? String(contact.assignedTo) : 'None';
    contact.assignedTo = userToAssign._id;

    contact.stageHistory.push({
        from: `Assigned: ${previousAssignee}`,
        to: `Assigned: ${userToAssign._id}`,
        by: req.user.id,
        note: `Manually assigned to ${userToAssign.name} by ${req.user.email || req.user.id}`
    });

    await contact.save();
    
    await createAndNotify(
        req,
        userToAssign._id,
        `Lead ${contact.name || contact.phone} has been assigned to you.`,
        `/contacts/${contact._id}`
    );
    
    const populated = await contact.populate({ path: 'assignedTo', select: 'name email' });
    res.json({ ok: true, data: populated });
});


// PATCH /api/contacts/:id/stage -> Change a contact's stage
exports.changeStage = asyncHandler(async (req, res) => {
  const { stage } = await stageSchema.validateAsync(req.body);

  const contact = await Contact.findOne({
    _id: req.params.id,
    tenantId: req.user.tenantId,
  });
  if (!contact) {
    res.status(404);
    throw new Error("Contact not found");
  }

  const prevStage = contact.stage;
  contact.stage = stage;
  contact.stageHistory.push({ from: prevStage, to: stage, by: req.user.id });

  if (stage === "sales" && contact.salesData?.pipeline_status === "won") {
    for (const item of contact.products) {
      await Product.findByIdAndUpdate(item.productId, { $inc: { stockQty: -item.qty } });
    }
  }

  await contact.save();
  const populated = await contact.populate([
      { path: 'products.productId', select: 'name price category' },
      { path: 'assignedTo', select: 'name email' }
  ]);
  res.json({ ok: true, data: populated });
});

// DELETE /api/contacts/:id -> Delete a contact
exports.delete = asyncHandler(async (req, res) => {
  const contact = await Contact.findOneAndDelete({
    _id: req.params.id,
    tenantId: req.user.tenantId,
  });
  if (!contact) {
    res.status(404);
    throw new Error("Contact not found");
  }
  res.json({ ok: true, data: { message: "Contact deleted successfully" } });
});

// GET /api/contacts/stats -> Get dashboard stats
exports.stats = asyncHandler(async (req, res) => {
  const { from, to } = req.query;
  const filter = { tenantId: req.user.tenantId };

  if (from || to) {
    filter.createdAt = {};
    if (from) filter.createdAt.$gte = new Date(from);
    if (to) filter.createdAt.$lte = new Date(new Date(to).setHours(23, 59, 59, 999));
  }
  
  if (req.user.role === 'sales') {
    filter.assignedTo = req.user.id;
  }

  const [leads, customers, salesDocs] = await Promise.all([
    Contact.countDocuments({ ...filter, stage: "lead" }),
    Contact.countDocuments({ ...filter, stage: "customer" }),
    Contact.find({ ...filter, stage: "sales", "salesData.pipeline_status": "won" }, "salesData.amount"),
  ]);

  const sales = salesDocs.length;
  const salesAmount = salesDocs.reduce((sum, c) => sum + (c.salesData?.amount || 0), 0);
  const totalLeadsForConversion = await Contact.countDocuments({ ...filter, stage: { $in: ["lead", "customer", "sales"] } });
  const conversionRate = totalLeadsForConversion > 0 ? ((sales / totalLeadsForConversion) * 100).toFixed(1) : 0;

  res.json({ ok: true, data: { leads, customers, sales, salesAmount, conversionRate } });
});