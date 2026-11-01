
import mongoose from "mongoose";

const FounderBalanceSchema = new mongoose.Schema(
  {
    founder: {
      type: String,
      required: true,
      enum: ["Mayank", "Krishna"],
    },
    capitalOutstandingPaise: {
      type: Number,
      default: 0,
      min: 0,
    },
    loanOutstandingPaise: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  { _id: false }
);

const AccountBalancesSchema = new mongoose.Schema(
  {
    cashPaise: {
      type: Number,
      default: 0,
      min: 0,
      validate: Number.isSafeInteger,
    },
    bankPaise: {
      type: Number,
      default: 0,
      min: 0,
      validate: Number.isSafeInteger,
    },
    silverGrams: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  { _id: false }
);

const ProfitSchema = new mongoose.Schema(
  {
    netSalesPaise: { type: Number, default: 0 },
    operatingMarginPaise: { type: Number, default: 0 },
    confirmedSilverAdjustmentPaise: { type: Number, default: 0 },
    provisionalSilverAdjustmentPaise: { type: Number, default: 0 },
    operatingExpensesPaise: { type: Number, default: 0 },
    setupCostsPaise: { type: Number, default: 0 },
    confirmedRealProfitPaise: { type: Number, default: 0 },
    estimatedRealProfitPaise: { type: Number, default: 0 },
  },
  { _id: false }
);

const OutletMonthCloseSchema = new mongoose.Schema(
  {
    monthKey: {
      type: String,
      required: true,
      unique: true,
      match: /^\d{4}-(0[1-9]|1[0-2])$/,
      index: true,
    },

    opening: {
      type: AccountBalancesSchema,
      required: true,
    },

    closing: {
      type: AccountBalancesSchema,
      required: true,
    },

    profit: {
      type: ProfitSchema,
      default: () => ({}),
    },

    founders: {
      type: [FounderBalanceSchema],
      default: [],
    },

    // Physical cash reconciliation
    physicalCashCountPaise: {
      type: Number,
      default: null,
      min: 0,
      validate: Number.isSafeInteger,
    },

    // Physical bank reconciliation
    physicalBankCountPaise: {
      type: Number,
      default: null,
      min: 0,
      validate: Number.isSafeInteger,
    },

    // Physical silver reconciliation
    physicalSilverCountGrams: {
      type: Number,
      default: null,
      min: 0,
    },

    // Differences = Physical count - System balance
    // Positive = excess; Negative = shortage.

    cashDifferencePaise: {
      type: Number,
      default: null,
      validate: Number.isSafeInteger,
    },

    bankDifferencePaise: {
      type: Number,
      default: null,
      validate: Number.isSafeInteger,
    },

    silverDifferenceGrams: {
      type: Number,
      default: null,
    },

    status: {
      type: String,
      enum: ["draft", "closed", "reopened"],
      default: "draft",
      index: true,
    },

    notes: {
      type: String,
      default: "",
      maxlength: 2000,
    },

    closedAt: {
      type: Date,
      default: null,
    },

    closedBy: {
      type: String,
      default: "",
    },

    previousMonthCloseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "OutletMonthClose",
      default: null,
    },
  },
  { timestamps: true }
);

export default mongoose.models.OutletMonthClose ||
  mongoose.model("OutletMonthClose", OutletMonthCloseSchema);
