// backend/checkContacts.js
require("dotenv").config();
const mongoose = require("mongoose");
const Contact = require("./models/Contact");

(async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("✅ Connected to MongoDB");

    const total = await Contact.countDocuments();
    console.log(`📊 Total contacts: ${total}`);

    const contacts = await Contact.find().sort({ createdAt: -1 }).limit(10).lean();
    console.log("📋 Last 10 contacts:");
    console.log(contacts);

    process.exit(0);
  } catch (err) {
    console.error("❌ Error:", err.message);
    process.exit(1);
  }
})();
