const router = require("express").Router();
const ctrl = require("../controllers/authController");
const auth = require("../middlewares/auth");
const requireRole = require("../middlewares/requireRole");

/**
 * @route   POST /api/auth/register
 * @desc    This route is disabled for admins as per new requirements. Only super admins can create users.
 * @access  Private (Admin)
 */
// router.post("/register", auth, requireRole("admin"), ctrl.register);

/**
 * @route   POST /api/auth/login
 * @desc    Login user and return token
 * @access  Public
 */
router.post("/login", ctrl.login);

/**
 * @route   GET /api/auth/me
 * @desc    Get current user profile
 * @access  Private (Admin or Sales)
 */
router.get("/me", auth, ctrl.me);

/**
 * @route   PATCH /api/auth/reset-password/:id
 * @desc    Reset password (Admin only)
 * @access  Private (Admin)
 */
router.patch("/reset-password/:id", auth, ctrl.resetPassword);


// --- ✅ START: NEW ROUTES FOR TENANT SETTINGS ---

/**
 * @route   GET /api/auth/tenant/settings
 * @desc    Get the current tenant's settings
 * @access  Private (Admin)
 */
router.get("/tenant/settings", auth, requireRole("admin"), ctrl.getTenantSettings);

/**
 * @route   PUT /api/auth/tenant/settings
 * @desc    Update the current tenant's settings
 * @access  Private (Admin)
 */
router.put("/tenant/settings", auth, requireRole("admin"), ctrl.updateTenantSettings);

// --- ✅ END: NEW ROUTES FOR TENANT SETTINGS ---


// --- ✅ START: NEW ROUTE TO GET ALL USERS ---
/**
 * @route   GET /api/auth/users
 * @desc    Get all users for the current tenant (e.g., for populating dropdowns)
 * @access  Private (Admin)
 */
router.get("/users", auth, requireRole("admin"), ctrl.getUsers);
// --- ✅ END: NEW ROUTE TO GET ALL USERS ---


module.exports = router;