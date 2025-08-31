require("dotenv").config();
const mongoose = require("mongoose");
const connectDB = require("./config/db");
const Contact = require("./models/Contact");
const Tenant = require("./models/Tenant");

// --- بداية الإعدادات ---
// !! هام: تأكد من أن هذا هو الـ "slug" الصحيح للشركة
const TENANT_SLUG = "mycompany"; 
// --- نهاية الإعدادات ---

const resetAssignments = async () => {
  try {
    console.log("Connecting to database...");
    await connectDB(process.env.MONGO_URI);

    const tenant = await Tenant.findOne({ slug: TENANT_SLUG });
    if (!tenant) {
      throw new Error(`Tenant with slug "${TENANT_SLUG}" not found.`);
    }
    console.log(`Found tenant: ${tenant.name} (${tenant._id})`);

    console.log(`Finding all leads for tenant "${TENANT_SLUG}" to reset their assignments...`);

    const result = await Contact.updateMany(
      { 
        tenantId: tenant._id,
        stage: "lead" 
      },
      { 
        $set: { assignedTo: null } 
      }
    );

    console.log("\n✅ Reset complete!");
    console.log(`- Documents matched: ${result.matchedCount}`);
    console.log(`- Documents modified: ${result.modifiedCount}`);

  } catch (error) {
    console.error("❌ An error occurred during the reset process:", error);
  } finally {
    await mongoose.disconnect();
    console.log("Database connection closed.");
    process.exit(0);
  }
};

resetAssignments();