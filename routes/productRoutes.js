const express = require("express");
const router = express.Router();
const controller = require("../controllers/productController");
const auth = require("../middlewares/auth");

router.use(auth);

// GET all products (scoped by tenant)
router.get("/", (req, res, next) => {
  req.query.tenantId = req.user.tenantId;
  controller.getProducts(req, res, next);
});

// GET one product
router.get("/:id", (req, res, next) => {
  req.query.tenantId = req.user.tenantId;
  controller.getProduct(req, res, next);
});

// Create product
router.post("/", (req, res, next) => {
  req.body.tenantId = req.user.tenantId;
  controller.createProduct(req, res, next);
});

// Update product
router.patch("/:id", (req, res, next) => {
  req.body.tenantId = req.user.tenantId;
  controller.updateProduct(req, res, next);
});

// Adjust stock
router.patch("/:id/stock", (req, res, next) => {
  req.body.tenantId = req.user.tenantId;
  controller.adjustStock(req, res, next);
});

module.exports = router;
