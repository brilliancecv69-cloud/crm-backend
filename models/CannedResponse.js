const mongoose = require("mongoose");

const cannedResponseSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    text: {
      type: String,
      required: true,
      trim: true,
    },
  },
  { timestamps: true }
);

cannedResponseSchema.index({ tenantId: 1, title: 1 });

module.exports = mongoose.model("CannedResponse", cannedResponseSchema);
