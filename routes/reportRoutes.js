// backend/routes/reportRoutes.js
const express = require("express");
const router = express.Router();
const ctrl = require("../controllers/reportController"); // 👈 بيتأكد إننا جايبين الكنترولر الصح

const auth = require("../middlewares/auth");
const requireRole = require("../middlewares/requireRole");

// 🟢 كل الروتات محمية بالـ auth + admin
router.use(auth);
router.use(requireRole("admin"));

// 🟢 Routes
router.get("/detailed", ctrl.getDetailedReport);
router.get("/export", ctrl.exportReport);

module.exports = router;
