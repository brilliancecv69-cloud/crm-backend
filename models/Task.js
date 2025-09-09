const mongoose = require("mongoose");

const taskSchema = new mongoose.Schema({
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true,
    index: true,
  },
  title: {
    type: String,
    required: [true, "Task title is required"],
    trim: true,
  },
  description: {
    type: String,
    trim: true,
  },
  assignedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  dueDate: {
    type: Date,
  },
  status: {
    type: String,
    enum: ['pending', 'completed'],
    default: 'pending',
    index: true,
  },
  // ✅ التعليقات
  comments: {
    type: [
      {
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        userName: { type: String }, // مؤقتًا شيلنا required عشان ما يضربش
        text: { type: String, required: true },
        createdAt: { type: Date, default: Date.now },
      }
    ],
    default: []   // <-- مهم جدًا
  },
}, { timestamps: true });

module.exports = mongoose.model("Task", taskSchema);
