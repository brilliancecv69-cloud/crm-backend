// backend/routes/customerRoutes.js
const router = require("express").Router();
const auth = require("../middlewares/auth");
const ctrl = require("../controllers/customerController");

// مرّر auth فقط لو هو فعلاً function (تجنّب نفس الخطأ)
if (typeof auth === "function") {
  router.use(auth);
}

// util: يضمن دايمًا return Function للـRouter
const wrap = (fn) => (req, res, next) => {
  if (typeof fn === "function") return fn(req, res, next);
  // لو الهاندلر مفقود نطلع خطأ واضح بدل ما يقع السيرفر عند التعريف
  next(new Error("Route handler missing for " + req.method + " " + req.originalUrl));
};

// List customers
router.get("/", wrap(ctrl.list));

// History must come before :id to avoid conflict
router.get("/:id/history", wrap(ctrl.history));

// Get one customer
router.get("/:id", wrap(ctrl.getOne));

// Convert Lead -> Customer (accepts lead id or phone in :id)
router.post("/convert/:id", wrap(ctrl.convertFromLead));

// Unified status endpoint (set status: lead|customer|sales)
router.post("/:id/status", wrap(ctrl.setStatus));

// Upgrade to sale (creates sale if model exists, then archives customer)
router.post("/:id/upgrade", wrap(ctrl.upgradeToSale));

// Update customer (generic update)
router.put("/:id", wrap(ctrl.update));

// Delete customer (admin) — المشكلة كانت هنا
router.delete("/:id", wrap(ctrl.remove));

module.exports = router;
