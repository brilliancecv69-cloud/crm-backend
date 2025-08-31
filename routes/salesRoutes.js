const express = require("express");
const router = express.Router();
const ctrl = require("../controllers/salesController");
const salesController = require("../controllers/salesController");

router.get("/", ctrl.listSales);
router.post("/", ctrl.createSale);
router.put("/:id", ctrl.updateSale);
router.delete("/:id", ctrl.deleteSale);
router.post("/customers/:id/toSale", salesController.createFromCustomer);

module.exports = router;
