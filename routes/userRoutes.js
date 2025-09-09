const router = require("express").Router();
const userController = require("../controllers/userController");
const auth = require("../middlewares/auth");
const requireRole = require("../middlewares/requireRole");

/**
 * @route   GET /api/users
 * @desc    Get all users for the current tenant with their status
 * @access  Private (Admin)
 */
router.get("/", auth, requireRole("admin"), userController.getUsers);

/**
 * @route   PUT /api/users/:id
 * @desc    Update a user's information
 * @access  Private (Admin)
 * @note    This now points to the clean controller function which includes
 * the logic for forcing logout if the user is deactivated.
 */
router.put("/:id", auth, requireRole("admin"), userController.updateUser);


/**
 * @route   GET /api/users/:id/sessions
 * @desc    Get the session history for a specific user
 * @access  Private (Admin)
 * @info    This is the new route to fetch login/logout data.
 */
router.get("/:id/sessions", auth, requireRole("admin"), userController.getUserSessions);


/**
 * @route   GET /api/users/:id
 * @desc    Get a single user by ID
 * @access  Private (Admin)
 */
router.get("/:id", auth, requireRole("admin"), userController.getUser);


/**
 * @route   DELETE /api/users/:id
 * @desc    Delete a user
 * @access  Private (Admin)
 */
router.delete("/:id", auth, requireRole("admin"), userController.deleteUser);


module.exports = router;