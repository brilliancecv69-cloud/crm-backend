require("dotenv").config();
const mongoose = require("mongoose");
const connectDB = require("./config/db");
const Contact = require("./models/Contact");
const User = require("./models/User");
const Tenant = require("./models/Tenant");

// --- بداية الإعدادات ---
// ✅ تم تعديل هذا السطر ليطابق شركتك
const TENANT_SLUG = "4cv"; 
// --- نهاية الإعدادات ---

const distributeLeads = async () => {
  try {
    console.log("Connecting to database...");
    await connectDB(process.env.MONGO_URI);

    // 1. البحث عن الشركة (Tenant)
    const tenant = await Tenant.findOne({ slug: TENANT_SLUG });
    if (!tenant) {
      throw new Error(`Tenant with slug "${TENANT_SLUG}" not found.`);
    }
    console.log(`Found tenant: ${tenant.name} (${tenant._id})`);

    // 2. جلب كل موظفي المبيعات لهذه الشركة
    const salesUsers = await User.find({ tenantId: tenant._id, role: "sales" }).lean();
    if (salesUsers.length === 0) {
      throw new Error("No sales users found for this tenant. Cannot distribute leads.");
    }
    console.log(`Found ${salesUsers.length} sales users:`, salesUsers.map(u => u.name).join(", "));

    // 3. جلب كل العملاء المحتملين الذين ليس لديهم مسؤول
    const unassignedLeads = await Contact.find({
      tenantId: tenant._id,
      stage: "lead",
      $or: [
        { assignedTo: null }, 
        { assignedTo: { $exists: false } }
      ]
    });

    if (unassignedLeads.length === 0) {
      console.log("✅ No unassigned leads found. Nothing to do.");
      return;
    }
    console.log(`Found ${unassignedLeads.length} unassigned leads to distribute.`);

    // 4. البدء في عملية التوزيع
    let successfulAssignments = 0;
    for (let i = 0; i < unassignedLeads.length; i++) {
      const lead = unassignedLeads[i];
      const userToAssign = salesUsers[i % salesUsers.length]; // آلية التوزيع الدوري

      try {
        lead.assignedTo = userToAssign._id;
        await lead.save();
        console.log(`Assigned lead ${lead.phone} to ${userToAssign.name}`);
        successfulAssignments++;
      } catch (err) {
        console.error(`Failed to assign lead ${lead.phone}. Error: ${err.message}`);
      }
    }
    
    console.log(`\n🎉 Distribution complete! Successfully assigned ${successfulAssignments} leads.`);

  } catch (error) {
    console.error("❌ An error occurred during the distribution process:", error);
  } finally {
    await mongoose.disconnect();
    console.log("Database connection closed.");
    process.exit(0);
  }
};

distributeLeads();