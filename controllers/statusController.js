// backend/controllers/statusController.js
const express = require("express");
const router = express.Router();
const Status = require("../models/Status");
const auth = require("../middlewares/auth"); // افتراض وجود middleware auth
const asyncHandler = require("../middlewares/asyncHandler");

// Use auth for these routes
router.use(auth);

/**
 * Helper: validate that a given status key (or label) exists for client (or global)
 * Usage: const ok = await validateStatus(req.user?.clientId, "converted");
 */
async function validateStatus(clientId, statusKey) {
  if (!statusKey) return false;
  const q = {
    $or: [
      { clientId: clientId || null, key: statusKey },
      { clientId: null, key: statusKey }, // global statuses
    ],
  };
  // if statusKey could be a label, check key or label
  const found = await Status.findOne({
    $and: [
      { $or: [{ key: statusKey }, { label: statusKey }] },
      { $or: [{ clientId: clientId || null }, { clientId: null }] }
    ]
  }).lean();
  return !!found;
}

// GET /api/settings/statuses
router.get("/statuses", asyncHandler(async (req, res) => {
  const clientId = req.user?.clientId || null;
  // return global + client-specific statuses ordered
  const statuses = await Status.find({
    $or: [{ clientId: null }, { clientId }]
  }).sort({ order: 1, label: 1 }).lean();
  res.json({ ok: true, statuses });
}));

// POST /api/settings/statuses  { key, label, order }
router.post("/statuses", asyncHandler(async (req, res) => {
  const clientId = req.user?.clientId || null;
  const { key, label, order } = req.body;
  if (!key || !label) return res.status(400).json({ ok: false, error: "key and label are required" });

  // prevent duplicates (within client or global)
  const exists = await Status.findOne({
    $and: [
      { key },
      { $or: [{ clientId }, { clientId: null }] }
    ]
  });
  if (exists) return res.status(400).json({ ok: false, error: "status key already exists" });

  const s = await Status.create({ key, label, order: order || 0, clientId });
  res.status(201).json({ ok: true, status: s });
}));

// PUT /api/settings/statuses/:id
router.put("/statuses/:id", asyncHandler(async (req, res) => {
  const clientId = req.user?.clientId || null;
  const id = req.params.id;
  const payload = {};
  ["key", "label", "order"].forEach(k => { if (req.body[k] !== undefined) payload[k] = req.body[k]; });
  // optional: ensure update respects ownership (clientId)
  const q = { _id: id, $or: [{ clientId }, { clientId: null }] };
  const updated = await Status.findOneAndUpdate(q, payload, { new: true, runValidators: true });
  if (!updated) return res.status(404).json({ ok: false, error: "status not found or permission denied" });
  res.json({ ok: true, status: updated });
}));

// DELETE /api/settings/statuses/:id
router.delete("/statuses/:id", asyncHandler(async (req, res) => {
  const clientId = req.user?.clientId || null;
  const id = req.params.id;
  const q = { _id: id, $or: [{ clientId }, { clientId: null }] };
  const del = await Status.findOneAndDelete(q);
  if (!del) return res.status(404).json({ ok: false, error: "status not found or permission denied" });

  // Optional: handle leads that had this status:
  // you may want to set them to "lead" or null; we won't change leads automatically here.
  res.json({ ok: true, message: "deleted" });
}));

module.exports = { router, validateStatus };
