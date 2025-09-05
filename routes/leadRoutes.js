const router = require("express").Router();
const auth = require("../middlewares/auth");
const {
  list, getOne, create, update, remove, messages
} = require("../controllers/leadController");

router.use(auth);

router.get("/", list);
router.get("/:id", getOne);
router.post("/", create);
router.put("/:id", update);
router.delete("/:id", remove);
router.get("/messages/:leadId", messages);

module.exports = router;
