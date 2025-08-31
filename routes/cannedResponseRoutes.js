const router = require("express").Router();
const ctrl = require("../controllers/cannedResponseController");
const auth = require("../middlewares/auth");

//
// All routes in this file are protected and require a valid token.
//
router.use(auth);

// GET /api/canned-responses -> Get all responses
router.get("/", (req, res, next) => {
  req.query.tenantId = req.user.tenantId;
  ctrl.list(req, res, next);
});

// POST /api/canned-responses -> Create a new response
router.post("/", (req, res, next) => {
  req.body.tenantId = req.user.tenantId;
  ctrl.create(req, res, next);
});

// PATCH /api/canned-responses/:id -> Update a response
router.patch("/:id", (req, res, next) => {
  req.body.tenantId = req.user.tenantId;
  ctrl.update(req, res, next);
});

// DELETE /api/canned-responses/:id -> Delete a response
router.delete("/:id", (req, res, next) => {
  req.query.tenantId = req.user.tenantId;
  ctrl.remove(req, res, next);
});

module.exports = router;
