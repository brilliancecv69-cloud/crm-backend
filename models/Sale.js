// backend/models/Sale.js
const mongoose = require("mongoose");

const SaleSchema = new mongoose.Schema(
  {
    // --- ✅ Core Fields ---
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      required: true,
      index: true,
    },
    contactId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Contact", // Using the unified Contact model
      required: true,
      index: true 
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    products: [{
        productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
        qty: { type: Number, required: true, min: 1 },
        price: { type: Number, required: true },
        name: String, // Denormalized product name for historical records
    }],
    totalAmount: { // This is the sum of product prices
        type: Number, 
        required: true,
        default: 0, 
        min: 0 
    },
    notes: { 
        type: String, 
        trim: true 
    },
    
    // --- ✅ Shipping Details ---
    shippingDetails: {
      company: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'ShippingCompany', // Reference to the new ShippingCompany model
        default: null,
      },
      trackingNumber: {
        type: String,
        trim: true,
        default: '',
      },
      cost: { // The cost of shipping
        type: Number,
        default: 0
      },
      address: {
        governorate: { type: String, trim: true },
        city: { type: String, trim: true },
        street: { type: String, trim: true },
      },
      status: {
        type: String,
        enum: ['pending', 'processing', 'shipped', 'delivered', 'returned', 'cancelled'],
        default: 'pending',
        index: true,
      }
    }
  },
  { timestamps: true }
);

// Indexes for better query performance
SaleSchema.index({ tenantId: 1, createdAt: -1 });
SaleSchema.index({ tenantId: 1, "shippingDetails.status": 1 });

module.exports = mongoose.model("Sale", SaleSchema);