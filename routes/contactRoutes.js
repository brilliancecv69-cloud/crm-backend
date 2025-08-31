const router = require("express").Router();
const ctrl = require("../controllers/contactController");
const auth = require("../middlewares/auth");
const upload = require("../middlewares/upload");
const xlsx = require("xlsx");
const Contact = require("../models/Contact");

router.use(auth);

// 📌 Create or Update a contact using the new upsert logic
router.post("/", (req, res, next) => {
  req.body.tenantId = req.user.tenantId; // 🟢 ضمان إن الكونتاكت يتخزن مع tenantId
  ctrl.createOrUpdate(req, res, next);
});

// 📌 List contacts (مع tenant filter)
router.get("/", (req, res, next) => {
  req.query.tenantId = req.user.tenantId;
  ctrl.list(req, res, next);
});

// 📊 Dashboard stats endpoint
router.get("/stats", (req, res, next) => {
  req.query.tenantId = req.user.tenantId;
  ctrl.stats(req, res, next);
});

// 📌 Get one contact
router.get("/:id", (req, res, next) => {
  req.query.tenantId = req.user.tenantId;
  ctrl.getOne(req, res, next);
});

// 📌 Update contact
router.patch("/:id", (req, res, next) => {
  req.body.tenantId = req.user.tenantId;
  ctrl.update(req, res, next);
});

// 📌 Change stage
router.patch("/:id/stage", (req, res, next) => {
  req.body.tenantId = req.user.tenantId;
  ctrl.changeStage(req, res, next);
});

// 📌 Delete contact
router.delete("/:id", (req, res, next) => {
  req.query.tenantId = req.user.tenantId;
  ctrl.delete(req, res, next);
});

// 📌 Import contacts from Excel
router.post("/import", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ ok: false, error: "No file uploaded" });
    }

    const workbook = xlsx.readFile(req.file.path);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = xlsx.utils.sheet_to_json(sheet);

    if (!rows.length) {
      return res.status(400).json({ ok: false, error: "Excel file is empty" });
    }

    const contacts = rows.map(r => ({
      tenantId: req.user.tenantId, // 🟢 كل contact مربوط بالـ tenant
      name: r.Name,
      phone: String(r.Phone),
      email: r.Email || "",
      address: r.Address || "",
      notes: r.Notes || "",
      stage: "lead"
    }));

    await Contact.insertMany(contacts, { ordered: false });

    res.json({ ok: true, data: `${contacts.length} leads imported successfully` });
  } catch (err) {
    console.error("Import error:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ✅ Health check
router.get("/health", (req, res) => {
  res.json({ ok: true, service: "Contacts API" });
});

module.exports = router;
