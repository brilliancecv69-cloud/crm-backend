const mongoose = require("mongoose");

const stageHistorySchema = new mongoose.Schema({
  from: String,
  to: String,
  by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  note: String,
  timestamp: { type: Date, default: Date.now }
});

const contactSchema = new mongoose.Schema({
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true,
    index: true,
  },
  name: {
    type: String,
    trim: true,
  },
  phone: {
    type: String,
    required: true,
    trim: true,
    index: true,
  },
  email: {
    type: String,
    trim: true,
    lowercase: true,
  },
  address: {
    type: String,
    trim: true,
  },
  notes: {
    type: String,
    trim: true,
  },
  stage: {
    type: String,
    enum: ['lead', 'customer', 'sales'],
    default: 'lead',
    index: true,
  },
  assignedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  products: [{
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
    qty: { type: Number, required: true },
    price: { type: Number, required: true },
    _id: false
  }],
  stageHistory: [stageHistorySchema],
  
  // --- ✅ START: NEW FIELD ADDED ---
  lastMessageTimestamp: {
    type: Date,
    index: true, // To optimize sorting by this field
  },
  // --- ✅ END: NEW FIELD ADDED ---

  isArchived: {
    type: Boolean,
    default: false,
  },

  // --- ✅ START: THIS IS THE MISSING SECTION ---
  salesData: {
    pipeline_status: {
        type: String,
        enum: ['new', 'negotiation', 'won', 'lost', null],
        default: 'new'
    },
    amount: {
        type: Number,
        default: 0
    },
    probability: {
        type: Number,
        default: 0
    },
    shippingDetails: {
      company: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'ShippingCompany',
          default: null,
      },
      trackingNumber: {
          type: String,
          trim: true,
          default: '',
      },
      cost: {
          type: Number,
          default: 0
      },
      address: {
          governorate: { type: String, trim: true, default: '' },
          city: { type: String, trim: true, default: '' },
          street: { type: String, trim: true, default: '' },
      },
      status: {
          type: String,
          enum: ['pending', 'processing', 'shipped', 'delivered', 'returned', 'cancelled'],
          default: 'pending',
      }
    }
  }
  // --- ✅ END: MISSING SECTION ADDED ---

}, { timestamps: true });

// To prevent creating the same contact (phone + tenant) twice
contactSchema.index({ phone: 1, tenantId: 1 }, { unique: true });

module.exports = mongoose.model('Contact', contactSchema);