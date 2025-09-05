// crm-frontend/backend/checkContacts.js
require("dotenv").config();
const mongoose = require("mongoose");
const Contact = require("./models/Contact");
const Message = require("./models/Message");

(async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("✅ Connected to MongoDB");

    // --- 1. عد جهات الاتصال ---
    const totalContacts = await Contact.countDocuments();
    console.log(`\n📊 Total contacts: ${totalContacts}`);

    // --- 2. عد الرسائل ---
    const totalMessages = await Message.countDocuments();
    console.log(`💬 Total messages: ${totalMessages}`);

    // --- 3. عرض آخر 5 جهات اتصال ---
    const contacts = await Contact.find().sort({ createdAt: -1 }).limit(5).lean();
    console.log("\n📋 Last 5 contacts added:");
    console.log(contacts);

    // --- 4. عرض آخر 5 رسائل (الجزء الأهم) ---
    const messages = await Message.find().sort({ createdAt: -1 }).limit(5).lean();
    console.log("\n📨 Last 5 messages added:");
    console.log(messages);


    process.exit(0);
  } catch (err) {
    console.error("❌ Error:", err.message);
    process.exit(1);
  }
})();