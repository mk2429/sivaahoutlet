import mongoose from "mongoose";

const TRANSACTION_TYPES = [
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
];

const ACCOUNTS = ["Cash", "Bank", "UPI", "Card", "Other"];

const PAYMENT_METHODS = [
  "Cash",
  "UPI",
  "Bank Transfer",
  "Card",
  "Other",
];

const PEOPLE = [
  "Mayank",
  "Krishna",
  "Shared",
  "Supplier",
  "Customer",
  "Other",
  "",
];

const PROFIT_TREATMENTS = [
  "income",
  "expense",
  "capital",
  "loan",
  "withdrawal",
  "inventory",
  "transfer",
  "opening",
  "none",
];

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
      enum: TRANSACTION_TYPES,
      index: true,
    },

    amount: {
      type: Number,
      required: true,
      min: 0.01,
      validate: {
        validator(value) {
          return (
            Number.isFinite(value) &&
            Math.abs(value * 100 - Math.round(value * 100)) < 1e-7
          );
        },
        message: "Amount must have no more than two decimal places.",
      },
    },

    amountPaise: {
      type: Number,
      min: 1,
      validate: {
        validator(value) {
          return (
            value == null ||
            (Number.isSafeInteger(value) && value > 0)
          );
        },
        message: "Amount in paise must be a positive integer.",
      },
    },

    idempotencyKey: {
      type: String,
      trim: true,
      maxlength: 120,
    },

    reversalOf: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "OutletTransaction",
      default: null,
    },

    reversedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "OutletTransaction",
      default: null,
    },

    purchaseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "OutletPurchase",
      default: null,
      index: true,
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
      enum: PEOPLE,
      default: "",
    },

    paymentMethod: {
      type: String,
      required: true,
      enum: PAYMENT_METHODS,
    },

    account: {
      type: String,
      required: true,
      enum: ACCOUNTS,
    },

    direction: {
      type: String,
      required: true,
      enum: ["in", "out"],
    },

    profitTreatment: {
      type: String,
      required: true,
      enum: PROFIT_TREATMENTS,
    },

    reference: {
      type: String,
      trim: true,
      maxlength: 120,
      default: "",
    },

    transferToAccount: {
      type: String,
      enum: [...ACCOUNTS, ""],
      default: "",
    },

    createdBy: {
      type: String,
      default: "Admin",
      trim: true,
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
  {
    timestamps: true,
  }
);

OutletTransactionSchema.index({
  transactionDate: -1,
  createdAt: -1,
});

OutletTransactionSchema.index(
  { idempotencyKey: 1 },
  {
    unique: true,
    partialFilterExpression: {
      idempotencyKey: { $type: "string", $gt: "" },
    },
    name: "outlet_transaction_idempotency_unique",
  }
);

export default mongoose.models.OutletTransaction ||
  mongoose.model("OutletTransaction", OutletTransactionSchema);