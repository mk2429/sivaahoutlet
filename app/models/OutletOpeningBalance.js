
import mongoose from "mongoose";

const FounderBalanceSchema = new mongoose.Schema(
  {
    founder: {
      type: String,
      enum: ["Mayank", "Krishna"],
      required: true,
    },

    capitalContributed: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },

    capitalReturned: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },

    loanOutstanding: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },

    notes: {
      type: String,
      trim: true,
      maxlength: 500,
      default: "",
    },
  },
  { _id: false }
);

const OutletOpeningBalanceSchema = new mongoose.Schema(
  {
    effectiveDate: {
      type: Date,
      required: true,
      default: () => new Date(
        "2026-10-27T00:00:00.000+05:30"
      ),
    },

    currency: {
      type: String,
      enum: ["INR"],
      default: "INR",
      immutable: true,
    },

    // Physical money actually counted or verified.
    cashPaise: {
      type: Number,
      required: true,
      min: 0,
      validate: {
        validator: Number.isSafeInteger,
        message: "Cash must be recorded as whole paise.",
      },
    },

    bankPaise: {
      type: Number,
      required: true,
      min: 0,
      validate: {
        validator: Number.isSafeInteger,
        message: "Bank balance must be recorded as whole paise.",
      },
    },

    // These are verified obligations at cutover, not expenses.
    supplierDuesPaise: {
      type: Number,
      required: true,
      min: 0,
      validate: {
        validator: Number.isSafeInteger,
        message: "Supplier dues must be whole paise.",
      },
    },

    gstPayablePaise: {
      type: Number,
      required: true,
      min: 0,
      validate: {
        validator: Number.isSafeInteger,
        message: "GST payable must be whole paise.",
      },
    },

    customerAdvancesPaise: {
      type: Number,
      required: true,
      min: 0,
      validate: {
        validator: Number.isSafeInteger,
        message: "Customer advances must be whole paise.",
      },
    },

    founders: {
      type: [FounderBalanceSchema],
      default: [],
      validate: {
        validator(founders) {
          const names = founders.map((item) => item.founder);
          return new Set(names).size === names.length;
        },
        message: "Each founder can appear only once.",
      },
    },

    // Reference to the physical silver count at cutover.
    // This does not create or alter Silver Ledger entries.
    physicalSilverGrams: {
      type: Number,
      required: true,
      min: 0,
    },

    silverCountVerified: {
      type: Boolean,
      required: true,
      default: false,
    },

    verified: {
      type: Boolean,
      required: true,
      default: false,
    },

    verificationNotes: {
      type: String,
      trim: true,
      maxlength: 2000,
      default: "",
    },

    sourceReferences: {
      type: [String],
      default: [],
    },

    createdBy: {
      type: String,
      required: true,
      trim: true,
    },

    verifiedBy: {
      type: String,
      trim: true,
      default: "",
    },

    verifiedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Only one opening snapshot per accounting start date.
OutletOpeningBalanceSchema.index(
  { effectiveDate: 1 },
  { unique: true }
);

export default mongoose.models.OutletOpeningBalance ||
  mongoose.model(
    "OutletOpeningBalance",
    OutletOpeningBalanceSchema
  );
