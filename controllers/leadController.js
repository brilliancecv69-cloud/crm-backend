const Joi = require("joi");
const Lead = require("../models/Lead");
const Message = require("../models/Message");
const asyncHandler = require("../middlewares/asyncHandler");

// نسمح لـ lastContacted، ونشيل whatsappFirstSeen لو اتبعت
const leadCreateSchema = Joi.object({
  phone: Joi.string().trim().required(),
  name: Joi.string().trim().optional().allow("").allow(null),
  email: Joi.string().trim().email({ tlds: { allow: false } }).optional().allow("").allow(null),
  address: Joi.string().trim().optional().allow("").allow(null),
  notes: Joi.string().trim().optional().allow("").allow(null),
  status: Joi.string().trim().optional().allow("").allow(null).default("lead"),
  last_message: Joi.string().trim().optional().allow("").allow(null),

  // يدوي
  lastContacted: Joi.alternatives().try(Joi.date(), Joi.string().trim(), Joi.valid(null, "")).optional(),

  // يتسجل تلقائي من السيرفر → نشيله لو اتبعت
  whatsappFirstSeen: Joi.any().strip().optional(),
});

// helper: parse date strings safely
function toDateOrNull(v) {
  if (v === "" || v == null) return null;
  const d = (v instanceof Date) ? v : new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

// ✅ List (يدعم clientId=null للتوافق الرجعي)
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
    Lead.find(q).sort({ last_seen: -1 }).skip((page - 1) * pageSize).limit(Number(pageSize)).lean(),
    Lead.countDocuments(q),
  ]);

  res.json({ items, total, page: Number(page), pageSize: Number(pageSize) });
});

// ✅ Get one (يسمح بالسجلات القديمة)
exports.getOne = asyncHandler(async (req, res) => {
  const clientId = req.user?.clientId || null;
  const q = { _id: req.params.id };
  if (clientId) q.$or = [{ clientId }, { clientId: null }];
  const lead = await Lead.findOne(q);
  if (!lead) return res.status(404).json({ error: "Lead not found" });
  res.json(lead);
});

// ✅ Create/Upsert (idempotent) — whatsappFirstSeen يتحدد تلقائيًا أول مرة فقط
exports.create = asyncHandler(async (req, res) => {
  const data = await leadCreateSchema.validateAsync(req.body);
  const clientId = req.user?.clientId || null;

  const filter = { phone: data.phone, clientId: clientId || null };
  const now = new Date();

  const setOnInsert = {
    clientId,
    phone: data.phone,
    name: data.name ?? "",
    email: data.email ?? "",
    address: data.address ?? "",
    notes: data.notes ?? "",
    status: data.status ?? "lead",
    last_seen: now,
    // 👇 أول تسجيل فقط من السيرفر
    whatsappFirstSeen: now,
    // يدوي (لو اتبعت قيمة صحيحة نخزنها، وإلا null)
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
    last_seen: now, // سيستم
    // ❌ لا نحدث whatsappFirstSeen هنا إطلاقًا (أول مرة فقط عبر setOnInsert)
  };

  const lead = await Lead.findOneAndUpdate(
    filter,
    { $setOnInsert: setOnInsert, $set: set },
    { upsert: true, new: true }
  );

  res.status(201).json(lead);
});

// ✅ Update — تجاهل whatsappFirstSeen (عرض فقط)، lastContacted يدوي
exports.update = asyncHandler(async (req, res) => {
  const data = await leadCreateSchema.fork(["phone"], (s) => s.optional()).validateAsync(req.body);

  const clientId = req.user?.clientId || null;
  const q = { _id: req.params.id };
  if (clientId) q.$or = [{ clientId }, { clientId: null }];

  const patch = {
    ...data,
  };

  if (data.lastContacted !== undefined) patch.lastContacted = toDateOrNull(data.lastContacted);
  // ❌ whatsappFirstSeen اتشال بالفعل بالـ strip()، فلن يُحدث من العميل

  const lead = await Lead.findOneAndUpdate(q, patch, { new: true });
  if (!lead) return res.status(404).json({ error: "Lead not found" });
  res.json(lead);
});

// ✅ Remove
exports.remove = asyncHandler(async (req, res) => {
  const clientId = req.user?.clientId || null;
  const q = { _id: req.params.id };
  if (clientId) q.$or = [{ clientId }, { clientId: null }];

  const lead = await Lead.findOneAndDelete(q);
  if (!lead) return res.status(404).json({ error: "Lead not found" });
  await Message.deleteMany({ lead_id: req.params.id });
  res.json({ message: "Lead deleted" });
});

// ✅ Messages
exports.messages = asyncHandler(async (req, res) => {
  const leadId = req.params.leadId;
  const msgs = await Message.find({ lead_id: leadId }).sort({ timestamp: 1 });
  res.json(msgs);
});
