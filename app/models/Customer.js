import mongoose from "mongoose";

const WalletTransactionSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["credit", "debit"],
      required: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    balanceAfter: {
      type: Number,
      required: true,
      min: 0,
    },
    reason: {
      type: String,
      default: "",
      trim: true,
    },
    saleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Sale",
      default: null,
    },
    billNumber: {
      type: String,
      default: "",
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: true }
);

const CustomerBillSnapshotSchema = new mongoose.Schema(
  {
    saleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Sale",
      required: true,
    },
    billNumber: {
      type: String,
      required: true,
    },
    billDate: {
      type: Date,
      default: Date.now,
    },
    items: [
      {
        productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product" },
        pieceId: { type: mongoose.Schema.Types.ObjectId },
        name: { type: String, required: true },
        sku: { type: String, default: "" },
        weight: { type: Number, default: 0 },
        finalPrice: { type: Number, default: 0 },
        isReplaced: { type: Boolean, default: false },
      },
    ],
    totalWeight: {
      type: Number,
      default: 0,
    },
    grossAmount: {
      type: Number,
      default: 0,
    },
    discountAmount: {
      type: Number,
      default: 0,
    },
    netAmount: {
      type: Number,
      default: 0,
    },
    replacementCredit: {
      type: Number,
      default: 0,
    },
    walletUsed: {
      type: Number,
      default: 0,
    },
    walletCredited: {
      type: Number,
      default: 0,
    },
    amountPaid: {
      type: Number,
      default: 0,
    },
    paymentMethod: {
      type: String,
      default: "Cash",
    },
  },
  { _id: false }
);

const CustomerSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },

    whatsappNumber: {
      type: String,
      required: true,
      trim: true,
      unique: true,
      index: true,
    },

    gender: {
      type: String,
      required: true,
      enum: ["Female", "Male", "Other", "Prefer not to say"],
    },

    address: {
      type: String,
      default: "",
      trim: true,
      maxlength: 500,
    },

    dateOfBirth: {
      type: Date,
      default: null,
    },

    anniversaryDate: {
      type: Date,
      default: null,
    },

    walletBalance: {
      type: Number,
      default: 0,
      min: 0,
    },

    walletTransactions: {
      type: [WalletTransactionSchema],
      default: [],
    },

    bills: {
      type: [CustomerBillSnapshotSchema],
      default: [],
    },
  },
  { timestamps: true }
);

CustomerSchema.index({
  name: "text",
  whatsappNumber: "text",
});

export default mongoose.models.Customer ||
  mongoose.model("Customer", CustomerSchema);