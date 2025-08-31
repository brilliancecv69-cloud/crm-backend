// backend/routes/superAdminRoutes.js
const router = require("express").Router();
const Tenant = require("../models/Tenant");
const User = require("../models/User");
const WhatsAppAccount = require("../models/WhatsAppAccount");
const asyncHandler = require("../middlewares/asyncHandler");
const { superAuth } = require("../middlewares/superAuth");
const { login } = require("../controllers/superController");

/**
 * @route POST /api/super/login
 * @desc Super Admin login
 * @access Public
 */
router.post("/login", login);

// --- 🏢 TENANT MANAGEMENT ---

/**
 * @route POST /api/super/tenants
 * @desc إنشاء شركة جديدة + أول Admin + WhatsAppAccount
 * @access SuperAdmin فقط
 */
router.post(
  "/tenants",
  superAuth,
  asyncHandler(async (req, res) => {
    const { name, slug, maxUsers, adminName, adminEmail, adminPassword } = req.body;

    if (!name || !slug || !adminEmail || !adminPassword) {
      return res.status(400).json({ ok: false, error: "Missing required fields" });
    }

    // 1️⃣ إنشاء Tenant
    const tenant = await Tenant.create({
      name,
      slug,
      maxUsers: maxUsers || 5,
    });

    // 2️⃣ إنشاء Admin User للشركة دي
    const adminUser = await User.create({
      name: adminName || "Admin",
      email: adminEmail,
      password: adminPassword,
      role: "admin",
      tenantId: tenant._id,
    });

    // 3️⃣ إنشاء WhatsAppAccount افتراضي للشركة
    const waAccount = await WhatsAppAccount.create({
      tenantId: tenant._id,
      sessionName: `tenant-${slug}`,
    });

    // 4️⃣ Response
    res.status(201).json({
      ok: true,
      data: {
        tenant,
        admin: {
          id: adminUser._id,
          name: adminUser.name,
          email: adminUser.email,
        },
        whatsapp: {
          id: waAccount._id,
          sessionName: waAccount.sessionName,
          tenantId: waAccount.tenantId,
        },
      },
    });
  })
);

/**
 * @route GET /api/super/tenants
 * @desc قائمة الشركات
 * @access SuperAdmin
 */
router.get(
  "/tenants",
  superAuth,
  asyncHandler(async (req, res) => {
    const tenants = await Tenant.find().sort({ createdAt: -1 });
    res.json({ ok: true, data: tenants });
  })
);

// --- ✅ بداية المسارات الجديدة والمعدّلة ✅ ---

/**
 * @route GET /api/super/tenants/:id
 * @desc جلب بروفايل شركة معينة مع الإحصائيات (جديد)
 * @access SuperAdmin
 */
router.get("/tenants/:id", superAuth, asyncHandler(async (req, res) => {
    const tenant = await Tenant.findById(req.params.id);
    if (!tenant) return res.status(404).json({ ok: false, error: "Tenant not found" });

    const [adminCount, salesCount, waCount] = await Promise.all([
        User.countDocuments({ tenantId: tenant._id, role: 'admin' }),
        User.countDocuments({ tenantId: tenant._id, role: 'sales' }),
        WhatsAppAccount.countDocuments({ tenantId: tenant._id })
    ]);

    res.json({ 
        ok: true, 
        data: {
            ...tenant.toObject(),
            stats: { adminCount, salesCount, waCount }
        }
    });
}));

/**
 * @route PATCH /api/super/tenants/:id
 * @desc تعديل إعدادات الشركة (معدّل)
 * @access SuperAdmin
 */
router.patch(
  "/tenants/:id",
  superAuth,
  asyncHandler(async (req, res) => {
    const { name, maxUsers, isActive, subscription } = req.body;
    const updateData = {};

    if (name) updateData.name = name;
    if (maxUsers) updateData.maxUsers = maxUsers;
    if (typeof isActive === 'boolean') updateData.isActive = isActive;
    if (subscription) updateData.subscription = subscription;

    const tenant = await Tenant.findByIdAndUpdate(req.params.id, updateData, { new: true });
    if (!tenant) return res.status(404).json({ ok: false, error: "Tenant not found" });
    res.json({ ok: true, data: tenant });
  })
);

/**
 * @route DELETE /api/super/tenants/:id
 * @desc حذف شركة بالكامل (منطقيًا لم يتغير)
 * @access SuperAdmin
 */
router.delete(
  "/tenants/:id",
  superAuth,
  asyncHandler(async (req, res) => {
    const tenant = await Tenant.findByIdAndDelete(req.params.id);
    if (!tenant) return res.status(404).json({ ok: false, error: "Tenant not found" });

    await User.deleteMany({ tenantId: tenant._id });
    await WhatsAppAccount.deleteOne({ tenantId: tenant._id });

    res.json({ ok: true, data: { message: "Tenant deleted, users removed, WhatsApp account deleted" } });
  })
);

// --- 👥 USER MANAGEMENT ---

/**
 * @route POST /api/super/users
 * @desc إضافة يوزر (لم يتغير)
 * @access SuperAdmin
 */
router.post(
  "/users",
  superAuth,
  asyncHandler(async (req, res) => {
    const { name, email, password, role, tenantId } = req.body;

    if (!tenantId || !email || !password) {
      return res.status(400).json({ ok: false, error: "Missing required fields" });
    }

    const user = await User.create({
      name: name || "User",
      email,
      password,
      role: role || "sales",
      tenantId,
    });

    res.status(201).json({
      ok: true,
      data: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        tenantId: user.tenantId,
      },
    });
  })
);

/**
 * @route GET /api/super/users
 * @desc قائمة كل المستخدمين (لم يتغير)
 * @access SuperAdmin
 */
router.get(
  "/users",
  superAuth,
  asyncHandler(async (req, res) => {
    const users = await User.find().populate("tenantId", "name slug");
    res.json({ ok: true, data: users });
  })
);

/**
 * @route PATCH /api/super/users/:id
 * @desc تعديل بيانات مستخدم (جديد)
 * @access SuperAdmin
 */
router.patch("/users/:id", superAuth, asyncHandler(async (req, res) => {
    const { name, email, role, isActive, password } = req.body;
    
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ ok: false, error: "User not found" });

    if (name) user.name = name;
    if (email) user.email = email;
    if (role) user.role = role;
    if (typeof isActive === 'boolean') user.isActive = isActive;
    
    if (password) {
        await user.setPassword(password);
    } else {
        await user.save();
    }
    
    res.json({ ok: true, data: user });
}));

/**
 * @route DELETE /api/super/users/:id
 * @desc حذف مستخدم (جديد)
 * @access SuperAdmin
 */
router.delete("/users/:id", superAuth, asyncHandler(async (req, res) => {
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) return res.status(404).json({ ok: false, error: "User not found" });
    res.json({ ok: true, data: { message: "User deleted successfully" } });
}));

// --- 🔚 نهاية المسارات الجديدة والمعدّلة 🔚 ---

module.exports = router;