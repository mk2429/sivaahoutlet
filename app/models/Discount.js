import mongoose from "mongoose";

const DiscountSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
description: {
  type: String,
  trim: true,
  default: "",
  maxlength: 500,
},
    type: {
      type: String,
      enum: ["percentage", "flat"],
      required: true,
    },

    value: {
      type: Number,
      required: true,
      min: 0.01,
    },

    applicability: {
      type: String,
      enum: ["all", "category", "sku"],
      default: "all",
    },

    categories: {
      type: [String],
      default: [],
    },

    skus: {
      type: [String],
      default: [],
    },

    minBillAmount: {
      type: Number,
      default: 0,
      min: 0,
    },

    minWeightGrams: {
      type: Number,
      default: 0,
      min: 0,
    },

    startDate: {
      type: Date,
      default: null,
    },

    endDate: {
      type: Date,
      default: null,
    },

    active: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

DiscountSchema.index({ active: 1, applicability: 1 });

export default mongoose.models.Discount ||
  mongoose.model("Discount", DiscountSchema);