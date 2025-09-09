const router = require("express").Router();
const auth = require("../middlewares/auth");
const requireRole = require("../middlewares/requireRole");
const {
  list,
  getOne,
  create,
  update,
  remove,
  messages,
  assignLeadsBulk
} = require("../controllers/leadController");

router.use(auth);

// لازم يكون PUT بس عشان يطابق الكود عندك في الـ frontend
router.put("/assign-bulk", requireRole("admin"), assignLeadsBulk);

router.get("/", list);
router.get("/messages/:leadId", messages);
router.get("/:id", getOne);
router.post("/", create);
router.put("/:id", update);
router.delete("/:id", remove);

module.exports = router;
