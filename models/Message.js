// backend/models/Message.js
const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema(
  {
    tenantId: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: "Tenant", 
      required: true, 
      index: true 
    },

    contactId: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: "Contact", 
      required: true, 
      index: true 
    },

    direction: { 
      type: String, 
      enum: ["in", "out"], 
      required: true 
    },

    // نوع الرسالة: نخليها مفتوحة عشان واتساب ساعات يبعت "chat", "ptt", "revoked", إلخ
    type: { 
      type: String, 
      default: "text" 
    },

    // المحتوى (مطلوب لو النوع نص)
    body: { 
      type: String, 
      required: function () { return this.type === "text" || this.type === "chat"; } 
    },

    meta: {
      waMessageId: { type: String, index: true },
      mediaType: { type: String },    // image, video, pdf...
      mediaUrl: { type: String },
      error: { type: String },
    },
  },
  { timestamps: true }
);

messageSchema.index({ tenantId: 1, createdAt: 1 });
messageSchema.index({ contactId: 1, createdAt: 1 });
messageSchema.index({ waMessageId: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model("Message", messageSchema);
