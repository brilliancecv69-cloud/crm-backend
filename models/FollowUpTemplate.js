const mongoose = require("mongoose");

// This sub-schema defines a single message step in the follow-up sequence
const messageStepSchema = new mongoose.Schema({
  delay: { // Delay in hours after the previous step (or after activation for the first step)
    type: Number,
    required: true,
    min: 1, 
  },
  message: {
    type: String,
    required: true,
    trim: true,
  },
}, { _id: false });

const followUpTemplateSchema = new mongoose.Schema({
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true,
    index: true,
  },
  name: {
    type: String,
    required: true,
    trim: true,
  },
  messages: {
    type: [messageStepSchema],
    validate: [arrayLimit, '{PATH} exceeds the limit of 5 steps'], // Max 5 follow-up messages per template
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
}, { timestamps: true });

function arrayLimit(val) {
  return val.length <= 5;
}

module.exports = mongoose.model("FollowUpTemplate", followUpTemplateSchema);