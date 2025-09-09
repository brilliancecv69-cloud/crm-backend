const router = require("express").Router();
const taskController = require("../controllers/taskController");
const auth = require("../middlewares/auth");
const requireRole = require("../middlewares/requireRole");

// All task routes are protected
router.use(auth);

/**
 * @route   GET /api/tasks/my
 * @desc    Get all tasks assigned to the currently logged-in user
 * @access  Private (Sales and Admin)
 */
router.get("/my", taskController.getMyTasks);

/**
 * @route   POST /api/tasks/my
 * @desc    Create a new task for the logged-in sales user
 * @access  Private (Sales only)
 */
router.post("/my", requireRole('sales'), taskController.createSelfTask); // <-- ✅ تمت إضافة هذا السطر

/**
 * @route   GET /api/tasks
 * @desc    List all tasks (for admin view)
 * @access  Private (Admin only)
 */
router.get("/", requireRole('admin'), taskController.listTasks);

/**
 * @route   POST /api/tasks
 * @desc    Create a new task (for Admins to assign)
 * @access  Private (Admin only)
 */
router.post("/", requireRole('admin'), taskController.createTask);

/**
 * @route   PATCH /api/tasks/:id
 * @desc    Update a task (allows a user to update their own task)
 * @access  Private (Sales and Admin)
 */
router.patch("/:id", taskController.updateTask);

/**
 * @route   DELETE /api/tasks/:id
 * @desc    Delete a task
 * @access  Private (Admin only)
 */
router.delete("/:id", requireRole('admin'), taskController.deleteTask);

module.exports = router;