const express = require("express");
const router = express.Router();
const expenseCtrl = require("../controllers/expenseController");
const auth = require("../middlewares/auth");

router.use(auth);

// Create expense
router.post("/", (req, res, next) => {
  req.body.tenantId = req.user.tenantId;
  expenseCtrl.create(req, res, next);
});

// List expenses
router.get("/", (req, res, next) => {
  req.query.tenantId = req.user.tenantId;
  expenseCtrl.list(req, res, next);
});

// Get one expense
router.get("/:id", (req, res, next) => {
  req.query.tenantId = req.user.tenantId;
  expenseCtrl.getOne(req, res, next);
});

// Update expense
router.patch("/:id", (req, res, next) => {
  req.body.tenantId = req.user.tenantId;
  expenseCtrl.update(req, res, next);
});

// Delete expense
router.delete("/:id", (req, res, next) => {
  req.query.tenantId = req.user.tenantId;
  expenseCtrl.remove(req, res, next);
});

module.exports = router;
