import mongoose from "mongoose";

const PurchaseItemSchema = new mongoose.Schema(
  {
    pieceId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    weight: {
      type: Number,
      required: true,
      min: 0.001,
    },
    batchId: {
      type: String,
      default: "",
    },
    silverRatePerGram: {
      type: Number,
      required: true,
      min: 0,
    },
    labourPerGram: {
      type: Number,
      required: true,
      min: 0,
    },
    silverCostPaise: {
      type: Number,
      required: true,
      min: 0,
    },
    labourCostPaise: {
      type: Number,
      required: true,
      min: 0,
    },
    allocatedExtraCostPaise: {
      type: Number,
      default: 0,
      min: 0,
    },
    acquisitionCostPaise: {
      type: Number,
      required: true,
      min: 0,
    },
  },
  { _id: false }
);

const PurchaseProductSchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    sku: {
      type: String,
      required: true,
    },
    productName: {
      type: String,
      required: true,
    },
    items: {
      type: [PurchaseItemSchema],
      required: true,
      validate: {
        validator: (items) => items.length > 0,
        message: "Each product must contain at least one piece.",
      },
    },
    totalPieces: {
      type: Number,
      required: true,
      min: 1,
    },
    totalWeightGrams: {
      type: Number,
      required: true,
      min: 0.001,
    },
    silverCostPaise: {
      type: Number,
      required: true,
      min: 0,
    },
    labourCostPaise: {
      type: Number,
      required: true,
      min: 0,
    },
    totalCostPaise: {
      type: Number,
      required: true,
      min: 0,
    },
  },
  { _id: false }
);

const PurchasePaymentSchema = new mongoose.Schema(
  {
    transactionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "OutletTransaction",
      default: null,
    },
    method: {
      type: String,
      enum: ["Cash", "UPI", "Bank Transfer", "Card", "Other"],
      required: true,
    },
    account: {
      type: String,
      enum: ["Cash", "Bank", "UPI", "Card", "Other"],
      required: true,
    },
    amountPaise: {
      type: Number,
      required: true,
      min: 1,
      validate: {
        validator: Number.isSafeInteger,
        message: "Payment must be stored in integer paise.",
      },
    },
  },
  { _id: false }
);

const OutletPurchaseSchema = new mongoose.Schema(
  {
    purchaseNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },

    purchaseDate: {
      type: Date,
      required: true,
      index: true,
    },

    supplierName: {
      type: String,
      trim: true,
      maxlength: 150,
      default: "",
    },

    supplierPhone: {
      type: String,
      trim: true,
      maxlength: 20,
      default: "",
    },

    invoiceNumber: {
      type: String,
      trim: true,
      maxlength: 120,
      default: "",
    },

    reference: {
      type: String,
      trim: true,
      maxlength: 120,
      default: "",
    },

    products: {
      type: [PurchaseProductSchema],
      required: true,
      validate: {
        validator: (products) => products.length > 0,
        message: "A purchase must contain at least one product.",
      },
    },

    totalProducts: {
      type: Number,
      required: true,
      min: 1,
    },

    totalPieces: {
      type: Number,
      required: true,
      min: 1,
    },

    totalWeightGrams: {
      type: Number,
      required: true,
      min: 0.001,
    },

    averageSilverRatePerGram: {
      type: Number,
      required: true,
      min: 0,
    },

    averageLabourPerGram: {
      type: Number,
      required: true,
      min: 0,
    },

    silverCostPaise: {
      type: Number,
      required: true,
      min: 0,
    },

    labourCostPaise: {
      type: Number,
      required: true,
      min: 0,
    },

    gstPaise: {
      type: Number,
      default: 0,
      min: 0,
    },

    transportPaise: {
      type: Number,
      default: 0,
      min: 0,
    },

    otherChargesPaise: {
      type: Number,
      default: 0,
      min: 0,
    },

    totalCostPaise: {
      type: Number,
      required: true,
      min: 0,
    },

    payments: {
      type: [PurchasePaymentSchema],
      default: [],
    },

    amountPaidPaise: {
      type: Number,
      required: true,
      min: 0,
    },

    outstandingPaise: {
      type: Number,
      required: true,
      min: 0,
    },

    status: {
      type: String,
      enum: ["received", "cancelled"],
      default: "received",
      index: true,
    },

    notes: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: "",
    },

    createdBy: {
      type: String,
      default: "Admin",
    },

    isVoided: {
      type: Boolean,
      default: false,
      index: true,
    },

    voidReason: {
      type: String,
      trim: true,
      maxlength: 500,
      default: "",
    },
  },
  { timestamps: true }
);

OutletPurchaseSchema.index({
  purchaseDate: -1,
  createdAt: -1,
});

OutletPurchaseSchema.index({
  "products.productId": 1,
});

export default mongoose.models.OutletPurchase ||
  mongoose.model("OutletPurchase", OutletPurchaseSchema);