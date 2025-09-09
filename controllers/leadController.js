const Joi = require("joi");
const Contact = require("../models/Contact");
const Message = require("../models/Message");
const User = require("../models/User");
const asyncHandler = require("../middlewares/asyncHandler");

// ✅ Schema
const leadCreateSchema = Joi.object({
  phone: Joi.string().trim().required(),
  name: Joi.string().trim().optional().allow("").allow(null),
  email: Joi.string().trim().email({ tlds: { allow: false } }).optional().allow("").allow(null),
  address: Joi.string().trim().optional().allow("").allow(null),
  notes: Joi.string().trim().optional().allow("").allow(null),
  status: Joi.string().trim().optional().allow("").allow(null).default("lead"),
  last_message: Joi.string().trim().optional().allow("").allow(null),
  lastContacted: Joi.alternatives().try(Joi.date(), Joi.string().trim(), Joi.valid(null, "")).optional(),
  whatsappFirstSeen: Joi.any().strip().optional(), // هيتم تجاهلها
});

// ✅ Helper: parse safe date
function toDateOrNull(v) {
  if (v === "" || v == null) return null;
  const d = (v instanceof Date) ? v : new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

/* =====================================================
   LIST
===================================================== */
exports.list = asyncHandler(async (req, res) => {
  const { page = 1, pageSize = 20, phone = "", date = "" } = req.query;

  const q = {};
  const clientId = req.user?.clientId || null;
  if (clientId) q.$or = [{ clientId }, { clientId: null }];

  if (phone) q.phone = { $regex: phone, $options: "i" };

  if (date) {
    const start = new Date(date);
    const end = new Date(date);
    end.setHours(23, 59, 59, 999);
    q.createdAt = { $gte: start, $lte: end };
  }

  const [items, total] = await Promise.all([
    Contact.find(q).sort({ last_seen: -1 }).skip((page - 1) * pageSize).limit(Number(pageSize)).lean(),
    Contact.countDocuments(q),
  ]);

  res.json({ items, total, page: Number(page), pageSize: Number(pageSize) });
});

/* =====================================================
   GET ONE
===================================================== */
exports.getOne = asyncHandler(async (req, res) => {
  const clientId = req.user?.clientId || null;
  const q = { _id: req.params.id };
  if (clientId) q.$or = [{ clientId }, { clientId: null }];

  const lead = await Contact.findOne(q);
  if (!lead) return res.status(404).json({ error: "Lead not found" });
  res.json(lead);
});

/* =====================================================
   CREATE / UPSERT
===================================================== */
exports.create = asyncHandler(async (req, res) => {
  const data = await leadCreateSchema.validateAsync(req.body);
  const clientId = req.user?.clientId || null;
  const now = new Date();

  const filter = { phone: data.phone, clientId: clientId || null };

  const setOnInsert = {
    clientId,
    phone: data.phone,
    name: data.name ?? "",
    email: data.email ?? "",
    address: data.address ?? "",
    notes: data.notes ?? "",
    status: data.status ?? "lead",
    last_seen: now,
    whatsappFirstSeen: now,
    lastContacted: toDateOrNull(data.lastContacted),
  };

  const set = {
    ...(data.name != null ? { name: data.name } : {}),
    ...(data.email != null ? { email: data.email } : {}),
    ...(data.address != null ? { address: data.address } : {}),
    ...(data.notes != null ? { notes: data.notes } : {}),
    ...(data.status ? { status: data.status } : {}),
    ...(data.last_message != null ? { last_message: data.last_message } : {}),
    ...(data.lastContacted !== undefined ? { lastContacted: toDateOrNull(data.lastContacted) } : {}),
    last_seen: now,
  };

  const lead = await Contact.findOneAndUpdate(
    filter,
    { $setOnInsert: setOnInsert, $set: set },
    { upsert: true, new: true }
  );

  res.status(201).json(lead);
});

/* =====================================================
   UPDATE
===================================================== */
exports.update = asyncHandler(async (req, res) => {
  const data = await leadCreateSchema.fork(["phone"], (s) => s.optional()).validateAsync(req.body);

  const clientId = req.user?.clientId || null;
  const q = { _id: req.params.id };
  if (clientId) q.$or = [{ clientId }, { clientId: null }];

  const patch = { ...data };
  if (data.lastContacted !== undefined) patch.lastContacted = toDateOrNull(data.lastContacted);

  const lead = await Contact.findOneAndUpdate(q, patch, { new: true });
  if (!lead) return res.status(404).json({ error: "Lead not found" });
  res.json(lead);
});

/* =====================================================
   REMOVE
===================================================== */
exports.remove = asyncHandler(async (req, res) => {
  const clientId = req.user?.clientId || null;
  const q = { _id: req.params.id };
  if (clientId) q.$or = [{ clientId }, { clientId: null }];

  const lead = await Contact.findOneAndDelete(q);
  if (!lead) return res.status(404).json({ error: "Lead not found" });

  await Message.deleteMany({ lead_id: req.params.id });

  res.json({ message: "Lead deleted" });
});

/* =====================================================
   MESSAGES
===================================================== */
exports.messages = asyncHandler(async (req, res) => {
  const leadId = req.params.leadId;
  const msgs = await Message.find({ lead_id: leadId }).sort({ timestamp: 1 });
  res.json(msgs);
});

/* =====================================================
   ASSIGN BULK LEADS
===================================================== */
exports.assignLeadsBulk = asyncHandler(async (req, res) => {
  console.log("Assign Bulk Request Body:", req.body);

  const { leadIds, salesId } = req.body;
  const clientId = req.user?.clientId || null;

  if (!leadIds || !salesId || !Array.isArray(leadIds) || leadIds.length === 0) {
    return res.status(400).json({ error: "Please provide leadIds (array) and a salesId" });
  }

  const salesUser = await User.findOne({ _id: salesId, role: "sales" });
  if (!salesUser) {
    return res.status(404).json({ error: "Sales user not found or is not a sales representative" });
  }

  const filter = { _id: { $in: leadIds } };
  if (clientId) {
    filter.$or = [{ clientId }, { clientId: null }];
  }

  const updateResult = await Contact.updateMany(filter, {
    $set: { assignedTo: salesId, status: "Assigned" },
  });

  console.log("Update Result:", updateResult);

  if (updateResult.matchedCount === 0) {
    return res.status(404).json({ error: "No leads found with provided IDs." });
  }

  if (updateResult.modifiedCount === 0) {
    return res.status(200).json({
      message: `Leads were already assigned to ${salesUser.name}. No changes made.`,
      count: 0,
    });
  }

  res.status(200).json({
    message: `${updateResult.modifiedCount} leads successfully assigned to ${salesUser.name}.`,
    count: updateResult.modifiedCount,
  });
});
