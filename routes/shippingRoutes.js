const router = require("express").Router();
const ctrl = require("../controllers/shippingController");
const auth = require("../middlewares/auth");

router.use(auth);

// ✅ Routes for creating and listing companies
router.route("/")
  .post(ctrl.create)
  .get(ctrl.list);

// ✅ FIX: The static '/stats' route MUST be defined BEFORE the dynamic '/:id' route
router.get("/stats", ctrl.getStats);

// ✅ Routes for getting, updating, and deleting a single company
router.route("/:id")
  .get(ctrl.getOne)
  .patch(ctrl.update)
  .delete(ctrl.remove);

module.exports = router;