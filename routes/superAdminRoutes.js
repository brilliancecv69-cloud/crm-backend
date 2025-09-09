// backend/routes/superAdminRoutes.js
const router = require("express").Router();
const Tenant = require("../models/Tenant");
const User = require("../models/User");
const WhatsAppAccount = require("../models/WhatsAppAccount");
const asyncHandler = require("../middlewares/asyncHandler");
const { superAuth } = require("../middlewares/superAuth");
const { login } = require("../controllers/superController");

// --- 🔑 LOGIN ---
router.post("/login", login);


// --- 📈 DASHBOARD & STATS ---
router.get("/stats", superAuth, asyncHandler(async (req, res) => {
    const tenants = await Tenant.find().lean();
    const activeTenants = tenants.filter(t => t.subscription?.status === 'active').length;
    const totalRevenue = tenants.reduce((acc, t) => acc + (t.subscription?.price || 0), 0);
    const totalPaid = tenants.reduce((acc, t) => acc + (t.subscription?.paidAmount || 0), 0);
    res.json({
        ok: true,
        data: {
            totalTenants: tenants.length,
            activeTenants,
            totalRevenue,
            totalPaid,
            totalRemaining: totalRevenue - totalPaid,
        }
    });
}));


// --- 🏢 TENANT MANAGEMENT ---
router.get("/tenants", superAuth, asyncHandler(async (req, res) => {
    const tenants = await Tenant.find().sort({ createdAt: -1 }).lean();
    res.json({ ok: true, data: tenants });
}));

router.get("/tenants/:id", superAuth, asyncHandler(async (req, res) => {
    const tenant = await Tenant.findById(req.params.id).lean();
    if (!tenant) return res.status(404).json({ ok: false, error: "Tenant not found" });

    const stats = await User.aggregate([
        { $match: { tenantId: tenant._id } },
        { $group: { _id: "$role", count: { $sum: 1 } } }
    ]);

    res.json({ 
        ok: true, 
        data: {
            ...tenant,
            stats: {
                adminCount: stats.find(s => s._id === 'admin')?.count || 0,
                salesCount: stats.find(s => s._id === 'sales')?.count || 0,
            }
        }
    });
}));

router.post("/tenants", superAuth, asyncHandler(async (req, res) => {
    const { name, slug, adminEmail, adminPassword } = req.body;
    if (!name || !slug || !adminEmail || !adminPassword) {
      return res.status(400).json({ ok: false, error: "Missing required fields" });
    }
    const tenant = await Tenant.create({ name, slug });
    await User.create({ name: "Admin", email: adminEmail, password: adminPassword, role: "admin", tenantId: tenant._id });
    res.status(201).json({ ok: true, data: tenant });
}));

router.patch("/tenants/:id/subscription", superAuth, asyncHandler(async (req, res) => {
    const tenant = await Tenant.findById(req.params.id);
    if (!tenant) return res.status(404).json({ ok: false, error: "Tenant not found" });
    
    Object.assign(tenant.subscription, req.body);
    await tenant.save();
    res.json({ ok: true, data: tenant });
}));

router.patch("/tenants/:id", superAuth, asyncHandler(async (req, res) => {
    const { name, isActive } = req.body;
    const tenant = await Tenant.findByIdAndUpdate(req.params.id, { name, isActive }, { new: true });
    if (!tenant) return res.status(404).json({ ok: false, error: "Tenant not found" });
    res.json({ ok: true, data: tenant });
}));

router.delete("/tenants/:id", superAuth, asyncHandler(async (req, res) => {
    const tenant = await Tenant.findByIdAndDelete(req.params.id);
    if (!tenant) return res.status(404).json({ ok: false, error: "Tenant not found" });
    await User.deleteMany({ tenantId: tenant._id });
    res.json({ ok: true, data: { message: "Tenant deleted" } });
}));


// --- 👥 USER MANAGEMENT (API FIX) ---
// ✅ This is the corrected, simplified route that will fix the "pending" issue.
router.get("/users", superAuth, asyncHandler(async (req, res) => {
    const users = await User.find().populate("tenantId", "name slug").lean();
    res.json({ ok: true, data: users });
}));

router.post("/users", superAuth, asyncHandler(async (req, res) => {
    const { name, email, password, role, tenantId } = req.body;
    if (!tenantId || !email || !password) return res.status(400).json({ ok: false, error: "Missing required fields" });
    const user = await User.create({ name, email, password, role, tenantId });
    res.status(201).json({ ok: true, data: user });
}));

router.patch("/users/:id", superAuth, asyncHandler(async (req, res) => {
    const { name, email, role, isActive, password } = req.body;
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ ok: false, error: "User not found" });
    
    if (name) user.name = name;
    if (email) user.email = email;
    if (role) user.role = role;
    if (typeof isActive === 'boolean') user.isActive = isActive;
    if (password) await user.setPassword(password);
    else await user.save();
    
    res.json({ ok: true, data: user });
}));

router.delete("/users/:id", superAuth, asyncHandler(async (req, res) => {
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) return res.status(404).json({ ok: false, error: "User not found" });
    res.json({ ok: true, data: { message: "User deleted" } });
}));


module.exports = router;