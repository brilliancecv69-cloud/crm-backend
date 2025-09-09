const mongoose = require("mongoose");

const activeFollowUpSchema = new mongoose.Schema({
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true,
    index: true,
  },
  contactId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Contact',
    required: true,
    // A contact can only have one active follow-up at a time
    unique: true, 
  },
  templateId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'FollowUpTemplate',
    required: true,
  },
  currentStep: { // The index of the next message to be sent from the template's messages array
    type: Number,
    required: true,
    default: 0,
  },
  sendAt: { // The exact date and time the next message is scheduled to be sent
    type: Date,
    required: true,
    index: true, // Important for the scheduler to query this field efficiently
  },
  startedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  }
}, { timestamps: true });

module.exports = mongoose.model("ActiveFollowUp", activeFollowUpSchema);