
import mongoose from "mongoose";

const PaymentLineSchema = new mongoose.Schema(
  {
    method: {
      type: String,
      enum: ["Cash", "UPI", "Card", "Bank Transfer", "Other"],
      required: true,
    },
    amount: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const SaleItemSchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    pieceId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    name: { type: String, required: true },
    sku: { type: String, default: "" },
    category: { type: String, default: "" },
    batchId: { type: String, default: "" },
    hsnCode: { type: String, default: "7113" },

    weight: { type: Number, required: true, min: 0 },
    listPrice: { type: Number, required: true, min: 0 },
    discountAmount: { type: Number, default: 0, min: 0 },
    finalPrice: { type: Number, required: true, min: 0 },

    // Existing cost information
    actualAcquisitionCost: { type: Number, default: null, min: 0 },
    calculatedSourceCost: { type: Number, default: null, min: 0 },
    replacementCostAtSale: { type: Number, default: null, min: 0 },

    // Permanent sale-time snapshots
    packagingCostAtSale: { type: Number, default: 0, min: 0 },
    costAtSale: { type: Number, default: null, min: 0 },
    profitAtSale: { type: Number, default: null },

    // Cumulative confirmed silver replacement adjustment
    // Positive = gain, negative = loss
    silverReplacementAdjustment: {
      type: Number,
      default: 0,
    },

    // Original profit + cumulative silver adjustment
    actualProfitAfterReplenishment: {
      type: Number,
      default: null,
    },
  },
  { _id: false }
);

const SaleSchema = new mongoose.Schema(
  {
    billNumber: {
      type: String,
      required: true,
      unique: true,
    },

    silverRateAtSale: {
      type: Number,
      required: true,
      min: 0,
    },

    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      default: null,
    },

    customerSnapshot: {
      name: { type: String, default: "Walk-in Customer" },
      whatsappNumber: { type: String, default: "" },
      address: { type: String, default: "" },
      gstin: { type: String, default: "" },
    },

    items: {
      type: [SaleItemSchema],
      required: true,
    },

    discount: {
      discountId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Discount",
        default: null,
      },
      name: { type: String, default: "" },
      type: { type: String, default: "" },
      value: { type: Number, default: 0 },
    },

    grossAmount: { type: Number, required: true, min: 0 },
    discountAmount: { type: Number, default: 0, min: 0 },
    netAmount: { type: Number, required: true, min: 0 },

    // Bill-level totals: derived from individual pieces
    totalCostAtSale: { type: Number, default: 0, min: 0 },
    profitAtSale: { type: Number, default: 0 },

    silverReplacementAdjustment: {
      type: Number,
      default: 0,
    },

    actualProfitAfterReplenishment: {
      type: Number,
      default: 0,
    },

    taxSnapshot: {
      rate: { type: Number, default: 3 },
      taxableValue: { type: Number, default: 0 },
      cgst: { type: Number, default: 0 },
      sgst: { type: Number, default: 0 },
      igst: { type: Number, default: 0 },
      totalTax: { type: Number, default: 0 },
      inclusive: { type: Boolean, default: true },
      placeOfSupplyStateCode: { type: String, default: "09" },
    },

    amountPaid: { type: Number, default: 0, min: 0 },
    balance: { type: Number, default: 0, min: 0 },

    paymentMethod: {
      type: String,
      enum: ["Cash", "UPI", "Card", "Bank Transfer", "Other", "Split"],
      default: "Cash",
    },

    paymentSummary: {
      type: [PaymentLineSchema],
      default: [],
    },

    salespersonName: { type: String, default: "" },

    status: {
      type: String,
      enum: ["completed", "cancelled"],
      default: "completed",
    },
  },
  { timestamps: true }
);

export default mongoose.models.Sale ||
  mongoose.model("Sale", SaleSchema);
