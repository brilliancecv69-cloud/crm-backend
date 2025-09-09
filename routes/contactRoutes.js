const router = require("express").Router();
const ctrl = require("../controllers/contactController");
const auth = require("../middlewares/auth");
const requireRole = require("../middlewares/requireRole");
const upload = require("../middlewares/upload");
const xlsx = require("xlsx");
const Contact = require("../models/Contact");
// --- ✅ START: NEW CONTROLLER IMPORTED ---
const followUpCtrl = require("../controllers/followUpController");
// --- ✅ END: NEW CONTROLLER IMPORTED ---

router.use(auth);

// --- ✅ THE ORDER OF ROUTES IS CRITICAL ---
// Specific GET routes must come BEFORE dynamic routes like /:id

// 📌 List contacts
router.get("/", (req, res, next) => {
  req.query.tenantId = req.user.tenantId;
  ctrl.list(req, res, next);
});

// 📊 Dashboard stats endpoint
router.get("/stats", (req, res, next) => {
  req.query.tenantId = req.user.tenantId;
  ctrl.stats(req, res, next);
});

// ✅ Export contacts to excel
router.get("/export", async (req, res) => {
    try {
        const leads = await Contact.find({ tenantId: req.user.tenantId, stage: 'lead' }).lean();
        const worksheetData = leads.length > 0 ? leads : [{ Name: "No leads found", Phone: "" }];
        const worksheet = xlsx.utils.json_to_sheet(worksheetData);
        const workbook = xlsx.utils.book_new();
        xlsx.utils.book_append_sheet(workbook, worksheet, "Leads");
        const buffer = xlsx.write(workbook, { bookType: 'xlsx', type: 'buffer' });
        res.setHeader('Content-Disposition', 'attachment; filename="leads.xlsx"');
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.send(buffer);
    } catch (err) {
        console.error("Export error:", err);
        res.status(500).send("Failed to export leads due to a server error.");
    }
});

// ✅ Health check
router.get("/health", (req, res) => {
  res.json({ ok: true, service: "Contacts API" });
});

// 📌 Get one contact (Dynamic route - MUST BE LAST among GET routes)
router.get("/:id", (req, res, next) => {
  req.query.tenantId = req.user.tenantId;
  ctrl.getOne(req, res, next);
});


// --- POST, PATCH, DELETE routes ---

// 📌 Create or Update a contact
router.post("/", (req, res, next) => {
  req.body.tenantId = req.user.tenantId;
  ctrl.createOrUpdate(req, res, next);
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
      tenantId: req.user.tenantId,
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


// --- ✅ FINAL FIX START ---

// 📌 Update contact
router.patch("/:id", (req, res, next) => {
  ctrl.update(req, res, next);
});

// 📌 Change stage
router.patch("/:id/stage", (req, res, next) => {
  ctrl.changeStage(req, res, next);
});

// --- ✅ FINAL FIX END ---


// 📌 Delete contact
router.delete("/:id", requireRole('admin'), (req, res, next) => {
  req.query.tenantId = req.user.tenantId;
  ctrl.delete(req, res, next);
});

// --- ✅ START: NEW FOLLOW-UP ROUTES ---

/**
 * @route   POST /api/contacts/:contactId/follow-up/start
 * @desc    Starts an automated follow-up sequence for a contact
 * @access  Private (Admin, Sales)
 */
router.post("/:contactId/follow-up/start", followUpCtrl.startFollowUp);

/**
 * @route   DELETE /api/contacts/:contactId/follow-up/stop
 * @desc    Stops an automated follow-up sequence for a contact
 * @access  Private (Admin, Sales)
 */
router.delete("/:contactId/follow-up/stop", followUpCtrl.stopFollowUp);

// --- ✅ END: NEW FOLLOW-UP ROUTES ---


module.exports = router;