// crm-frontend/backend/cleanup-backfill.js
require("dotenv").config();
const mongoose = require("mongoose");
const connectDB = require("./config/db");
const Contact = require("./models/Contact");
const Message = require("./models/Message");

// سيقرأ هذا السكربت المعرّف الخاطئ من ملف .env الخاص بك
const WRONG_TENANT_ID = process.env.BACKFILL_TENANT_ID;

(async () => {
  if (!WRONG_TENANT_ID) {
    console.error("❌ Please ensure BACKFILL_TENANT_ID is set in your .env file.");
    process.exit(1);
  }

  try {
    await connectDB(process.env.MONGO_URI);
    console.log("✅ Connected to MongoDB");

    console.log(`🗑️  Starting cleanup for tenantId: ${WRONG_TENANT_ID}`);

    const contactResult = await Contact.deleteMany({ tenantId: WRONG_TENANT_ID });
    console.log(`- Deleted ${contactResult.deletedCount} contacts.`);

    const messageResult = await Message.deleteMany({ tenantId: WRONG_TENANT_ID });
    console.log(`- Deleted ${messageResult.deletedCount} messages.`);

    console.log("\n✅ Cleanup complete!");
    process.exit(0);
  } catch (err) {
    console.error("❌ Error during cleanup:", err.message);
    process.exit(1);
  }
})();