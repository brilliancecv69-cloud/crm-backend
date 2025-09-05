const router = require("express").Router();
const ctrl = require("../controllers/cannedResponseController");
const auth = require("../middlewares/auth");

// All routes in this file are protected and require a valid token.
router.use(auth);

// GET /api/canned-responses -> Get all responses
// ✅ تم حذف السطر الذي كان يضيف tenantId بشكل خاطئ
router.get("/", ctrl.list);

// POST /api/canned-responses -> Create a new response
// ✅ تم حذف السطر الذي كان يضيف tenantId بشكل خاطئ
router.post("/", ctrl.create);

// PATCH /api/canned-responses/:id -> Update a response
// ✅ تم حذف السطر الذي كان يضيف tenantId بشكل خاطئ
router.patch("/:id", ctrl.update);

// DELETE /api/canned-responses/:id -> Delete a response
// ✅ تم حذف السطر الذي كان يضيف tenantId بشكل خاطئ
router.delete("/:id", ctrl.remove);

module.exports = router;