const mongoose = require("mongoose");
const logger = require("../utils/logger");

module.exports = async function connectDB(uri) {
  try {
    await mongoose.connect(uri);
    logger.info("✅ MongoDB connected");
  } catch (err) {
    logger.error("❌ MongoDB connection error", { err });
    process.exit(1);
  }
};
