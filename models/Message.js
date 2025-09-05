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
      enum: ["in", "out"], // in = received, out = sent
      required: true 
    },

    type: { 
      type: String, 
      enum: ["text", "image", "video", "audio", "file"], 
      default: "text" 
    },

    body: { 
      type: String, 
      required: function () { 
        // النص مطلوب فقط في الرسائل الكتابية
        return this.type === "text"; 
      } 
    },

    meta: {
      waMessageId: { type: String, index: true }, // ID من واتساب
      mediaType: { type: String },                // image/jpeg, application/pdf, إلخ
      mediaUrl: { type: String },                 // رابط التحميل / العرض
      fileName: { type: String },                 // اسم الملف لو مرفوع
      caption: { type: String },                  // التعليق مع الصورة/الفيديو
      error: { type: String },                    // لو فيه error من واتساب
    },
  },
  { timestamps: true }
);

// 🟢 Indexes
messageSchema.index({ tenantId: 1, createdAt: 1 });
messageSchema.index({ contactId: 1, createdAt: 1 });
messageSchema.index({ tenantId: 1, "meta.waMessageId": 1 }, { unique: true, sparse: true });

module.exports = mongoose.model("Message", messageSchema);
