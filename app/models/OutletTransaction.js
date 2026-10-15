import mongoose from "mongoose";

const OutletTransactionSchema = new mongoose.Schema(
  {
    transactionDate: {
      type: Date,
      required: true,
      index: true,
    },

    type: {
      type: String,
      required: true,
      enum: [
        "expense",
        "capital_contribution",
        "founder_loan",
        "founder_withdrawal",
        "inventory_purchase",
        "supplier_payment",
        "other_income",
        "customer_refund",
        "other_outflow",
        "opening_balance",
        "transfer",
      ],
      index: true,
    },

    amount: {
      type: Number,
      required: true,
      min: 0.01,
    },

    category: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },

    description: {
      type: String,
      trim: true,
      maxlength: 500,
      default: "",
    },

    person: {
      type: String,
      enum: [
        "Mayank",
        "Krishna",
        "Shared",
        "Supplier",
        "Customer",
        "Other",
        "",
      ],
      default: "",
    },

    paymentMethod: {
      type: String,
      enum: ["Cash", "UPI", "Bank Transfer", "Card", "Other"],
      required: true,
    },

    account: {
      type: String,
      enum: ["Cash", "Bank", "UPI", "Card", "Other"],
      required: true,
    },

    direction: {
      type: String,
      enum: ["in", "out"],
      required: true,
    },

    profitTreatment: {
      type: String,
      enum: [
        "income",
        "expense",
        "capital",
        "loan",
        "withdrawal",
        "inventory",
        "transfer",
        "opening",
        "none",
      ],
      required: true,
    },

    reference: {
      type: String,
      trim: true,
      maxlength: 120,
      default: "",
    },

    transferToAccount: {
      type: String,
      enum: ["Cash", "Bank", "UPI", "Card", "Other", ""],
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
      default: "",
    },
  },
  {
    timestamps: true,
  }
);

OutletTransactionSchema.index({
  transactionDate: -1,
  createdAt: -1,
});

export default mongoose.models.OutletTransaction ||
  mongoose.model("OutletTransaction", OutletTransactionSchema);