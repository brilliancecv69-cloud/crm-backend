const Contact = require("../models/Contact");
const Product = require("../models/Product");
const User = require("../models/User");
const Notification = require("../models/Notification");

function ok(res, data, code = 200) {
  return res.status(code).json({ ok: true, data });
}
function fail(res, error, code = 400) {
  return res.status(code).json({ ok: false, error });
}

let roundRobinIndex = 0;
async function pickSalesUser(tenantId) {
  const salesUsers = await User.find({ tenantId, role: "sales" }).sort({ createdAt: 1 });
  if (!salesUsers.length) return null;
  const user = salesUsers[roundRobinIndex % salesUsers.length];
  roundRobinIndex++;
  return user;
}
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

exports.createOrUpdate = async (req, res) => {
  try {
    const { phone, ...rest } = req.body;
    if (!phone) return fail(res, "Phone number is required", 400);

    let contact = await Contact.findOne({ phone, tenantId: req.user.tenantId });
    
    // ✅✅✅ **بداية التعديل** ✅✅✅
    if (!contact) {
      // Create new contact
      const assigned = await pickSalesUser(req.user.tenantId);
      
      contact = new Contact({
        phone,
        ...rest,
        stage: "lead",
        tenantId: req.user.tenantId,
        assignedTo: assigned ? assigned._id : null,
      });
      await contact.save();

      // Send notification ONLY if a new contact was created and assigned
      if (assigned) {
        await createAndNotify(
          req,
          assigned._id,
          `You have a new lead: ${contact.name || contact.phone}`,
          `/contacts/${contact._id}`
        );
      }
    } else {
      // Update existing contact
      Object.assign(contact, rest);
      await contact.save();
    }
    
    // This part runs for both new and updated contacts
    await contact.populate("products.productId", "name price category");
    await contact.populate("assignedTo", "name email");

    return ok(res, contact, 201);
    // ✅✅✅ **نهاية التعديل** ✅✅✅

  } catch (err) {
    if (err.code === 11000)
      return fail(res, "A contact with this phone number already exists in this tenant.", 409);
    return fail(res, err.message, 500);
  }
};

exports.getOne = async (req, res) => {
  try {
    const contact = await Contact.findOne({
      _id: req.params.id,
      tenantId: req.user.tenantId,
    })
      .populate("products.productId", "name price category")
      .populate("assignedTo", "name email");

    if (!contact) return fail(res, "Contact not found", 404);
    return ok(res, contact);
  } catch (err) {
    return fail(res, err.message, 500);
  }
};

exports.list = async (req, res) => {
  try {
    const {
      stage, q, pipeline_status, isArchived,
      page = 1, limit = 20, sortBy = "updatedAt", order = "desc",
      from, to // ✅ الإضافة الجديدة هنا
    } = req.query;

    const filter = { tenantId: req.user.tenantId };
    if (stage) filter.stage = stage;
    if (pipeline_status) filter["salesData.pipeline_status"] = pipeline_status;
    if (isArchived === "true") filter.isArchived = true;
    if (isArchived === "false") filter.isArchived = false;

    if (q) {
      const searchRegex = new RegExp(q, "i");
      filter.$or = [
        { name: searchRegex },
        { phone: searchRegex },
        { email: searchRegex },
        { notes: searchRegex },
      ];
    }
    
    // ✅✅✅ بداية الكود الجديد لفلتر التاريخ ✅✅✅
    if (from || to) {
      filter.createdAt = {};
      if (from) {
        filter.createdAt.$gte = new Date(from);
      }
      if (to) {
        const endDate = new Date(to);
        endDate.setHours(23, 59, 59, 999); // لضمان شمول اليوم بالكامل
        filter.createdAt.$lte = endDate;
      }
    }
    // ✅✅✅ نهاية الكود الجديد لفلتر التاريخ ✅✅✅
    
    if (req.user.role === 'sales') {
      filter.assignedTo = req.user.id;
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const sortOrder = order === "asc" ? 1 : -1;
    const sort = { [sortBy]: sortOrder };

    const [items, total] = await Promise.all([
      Contact.find(filter)
        .populate("products.productId", "name price category")
        .populate("assignedTo", "name email")
        .sort(sort).skip(skip).limit(parseInt(limit)),
      Contact.countDocuments(filter),
    ]);

    return ok(res, { items, total, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    return fail(res, err.message, 500);
  }
};

// ✅✅✅ تم تعديل هذه الدالة ✅✅✅
exports.update = async (req, res) => {
  try {
    const contact = await Contact.findOne({
      _id: req.params.id,
      tenantId: req.user.tenantId,
    });
    if (!contact) return fail(res, "Contact not found", 404);

    const { name, email, address, notes, salesData, products } = req.body;
    if (name !== undefined) contact.name = name;
    if (email !== undefined) contact.email = email;
    if (address !== undefined) contact.address = address;
    if (notes !== undefined) contact.notes = notes;

    if (salesData) {
      contact.salesData = { ...contact.salesData, ...salesData };
    }

    if (products) {
      contact.products = products;
    }

    await contact.save();
    
    // --- بداية التعديل ---
    const populated = await contact.populate([
        { path: 'products.productId', select: 'name price category' },
        { path: 'assignedTo', select: 'name email' }
    ]);
    // --- نهاية التعديل ---

    return ok(res, populated);
  } catch (err) {
    return fail(res, err.message, 500);
  }
};

// ✅✅✅ تم تعديل هذه الدالة ✅✅✅
exports.changeStage = async (req, res) => {
  try {
    const { stage } = req.body;
    if (!stage) return fail(res, "Stage is required", 400);

    const contact = await Contact.findOne({
      _id: req.params.id,
      tenantId: req.user.tenantId,
    });
    if (!contact) return fail(res, "Contact not found", 404);

    const prevStage = contact.stage;
    contact.stage = stage;
    contact.stageHistory.push({
      from: prevStage,
      to: stage,
      by: req.user?.id || "system",
    });

    if (stage === "sales" && contact.salesData?.pipeline_status === "won") {
      for (const item of contact.products) {
        await Product.findOneAndUpdate(
          { _id: item.productId, tenantId: req.user.tenantId },
          { $inc: { stockQty: -item.qty } }
        );
      }
    }

    await contact.save();
    
    // --- بداية التعديل ---
    const populated = await contact.populate([
        { path: 'products.productId', select: 'name price category' },
        { path: 'assignedTo', select: 'name email' }
    ]);
    // --- نهاية التعديل ---

    return ok(res, populated);
  } catch (err) {
    return fail(res, err.message, 500);
  }
};

exports.delete = async (req, res) => {
  try {
    const contact = await Contact.findOneAndDelete({
      _id: req.params.id,
      tenantId: req.user.tenantId,
    });
    if (!contact) return fail(res, "Contact not found", 404);
    return ok(res, { message: "Contact deleted successfully" });
  } catch (err) {
    return fail(res, err.message, 500);
  }
};

exports.stats = async (req, res) => {
  try {
    const { from, to } = req.query;
    const filter = { tenantId: req.user.tenantId };

    if (from || to) {
      filter.createdAt = {};
      if (from) filter.createdAt.$gte = new Date(from);
      if (to) filter.createdAt.$lte = new Date(to);
    }
    
    if (req.user.role === 'sales') {
      filter.assignedTo = req.user.id;
    }

    const [leads, customers, salesDocs] = await Promise.all([
      Contact.countDocuments({ ...filter, stage: "lead" }),
      Contact.countDocuments({ ...filter, stage: "customer" }),
      Contact.find({ ...filter, stage: "sales" }, "salesData.amount"),
    ]);

    const sales = salesDocs.length;
    const salesAmount = salesDocs.reduce(
      (sum, c) => sum + (c.salesData?.amount || 0),
      0
    );
    const conversionRate = leads > 0 ? ((customers / leads) * 100).toFixed(1) : 0;

    return ok(res, { leads, customers, sales, salesAmount, conversionRate });
  } catch (err) {
    return fail(res, err.message, 500);
  }
};