require("dotenv").config();
const mongoose = require("mongoose");
const User = require("./models/User");

(async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    const res = await User.deleteMany({});
    console.log(`✅ Deleted ${res.deletedCount} users`);
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();
