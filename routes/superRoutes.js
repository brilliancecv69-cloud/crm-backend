const express = require("express");
const router = express.Router();
const superCtrl = require("../controllers/superController");
const { superAuth } = require("../middlewares/superAuth");

// 🔑 Super Admin login
router.post("/login", superCtrl.login);

// 🏢 Tenants management
router.get("/tenants", superAuth, superCtrl.listTenants);
router.post("/tenants", superAuth, superCtrl.createTenant);

// 👥 Users management
router.get("/users", superAuth, superCtrl.listUsers);
router.post("/users", superAuth, superCtrl.createUser);

module.exports = router;
