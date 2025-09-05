const router = require("express").Router();
const ctrl = require("../controllers/authController");
const auth = require("../middlewares/auth");
const requireRole = require("../middlewares/requireRole");

/**
 * @route   POST /api/auth/register
 * @desc    Register a new user (Admin only)
 * @access  Private (Admin)
 */
router.post("/register", auth, requireRole("admin"), ctrl.register);

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

module.exports = router;
