const express = require("express");
const router = express.Router();
const controller = require("../controllers/productController");
const auth = require("../middlewares/auth");

router.use(auth);

// GET all products (scoped by tenant)
router.get("/", controller.getProducts);

// GET one product
router.get("/:id", controller.getProduct);

// Create product
router.post("/", controller.createProduct);

// Update product
router.patch("/:id", controller.updateProduct);

// Adjust stock
router.patch("/:id/stock", controller.adjustStock);

// Delete product
router.delete("/:id", controller.deleteProduct);

module.exports = router;
