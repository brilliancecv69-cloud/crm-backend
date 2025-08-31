require("dotenv").config();
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const Tenant = require("./models/Tenant");
const User = require("./models/User");

(async () => {
  try {
    // 1) Connect to DB
    await mongoose.connect(process.env.MONGO_URI);
    console.log("✅ Connected to MongoDB");

    // 2) Create Tenant
    const tenant = await Tenant.findOneAndUpdate(
      { slug: "tigershr" },
      { name: "Tiger HR", slug: "tigershr" },
      { upsert: true, new: true }
    );
    console.log("✅ Tenant ready:", tenant.name);

    // 3) Create Admin
    const adminPass = await bcrypt.hash("admin123", 10);
    await User.findOneAndUpdate(
      { email: "admin@tigershr.com" },
      { name: "Main Admin", email: "admin@tigershr.com", password: adminPass, role: "admin", tenantId: tenant._id },
      { upsert: true, new: true }
    );
    console.log("✅ Admin user created");

    // 4) Create Sales Users
    const sales = [
      { name: "Sales One", email: "sales1@tigershr.com" },
      { name: "Sales Two", email: "sales2@tigershr.com" },
      { name: "Sales Three", email: "sales3@tigershr.com" },
    ];

    for (const s of sales) {
      const hashed = await bcrypt.hash("sales123", 10);
      await User.findOneAndUpdate(
        { email: s.email },
        { ...s, password: hashed, role: "sales", tenantId: tenant._id },
        { upsert: true, new: true }
      );
    }
    console.log("✅ Sales users created");

    process.exit(0);
  } catch (err) {
    console.error("❌ Seed error:", err);
    process.exit(1);
  }
})();
