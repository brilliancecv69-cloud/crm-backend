const router = require("express").Router();
const ctrl = require("../controllers/followUpTemplateController");
const auth = require("../middlewares/auth");

// All routes in this file are protected and require a user to be logged in.
router.use(auth);

/**
 * @route   POST /api/follow-up-templates
 * @desc    Create a new follow-up template
 * @access  Private (Admin, Sales)
 */
router.post("/", ctrl.createTemplate);

/**
 * @route   GET /api/follow-up-templates
 * @desc    List all available templates for the user
 * @access  Private (Admin, Sales)
 */
router.get("/", ctrl.listTemplates);

/**
 * @route   GET /api/follow-up-templates/:id
 * @desc    Get a single template by its ID
 * @access  Private (Admin, Sales)
 */
router.get("/:id", ctrl.getTemplate);

/**
 * @route   PUT /api/follow-up-templates/:id
 * @desc    Update a template that the user owns
 * @access  Private (Owner)
 */
router.put("/:id", ctrl.updateTemplate);

/**
 * @route   DELETE /api/follow-up-templates/:id
 * @desc    Delete a template that the user owns
 * @access  Private (Owner)
 */
router.delete("/:id", ctrl.deleteTemplate);

module.exports = router;