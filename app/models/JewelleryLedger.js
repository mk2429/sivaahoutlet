
import mongoose from "mongoose";

const JewelleryLedgerSchema = new mongoose.Schema(
  {
    entryDate: { type: Date, required: true, index: true },
    movementType: {
      type: String,
      enum: [
        "opening_stock",
        "stock_in",
        "sale",
        "customer_return",
        "damage",
        "loss",
        "adjustment_in",
        "adjustment_out",
      ],
      required: true,
      index: true,
    },
    direction: {
      type: String,
      enum: ["in", "out"],
      required: true,
    },
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      default: null,
      index: true,
    },
    pieceId: { type: mongoose.Schema.Types.ObjectId, default: null, index: true },
    saleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Sale",
      default: null,
      index: true,
    },
    billNumber: { type: String, default: "" },
    sku: { type: String, default: "" },
    productName: { type: String, required: true },
    batchId: { type: String, default: "" },
    weight: { type: Number, required: true, min: 0.001 },
    sourceSilverRate: { type: Number, default: null, min: 0 },
    labourPerGram: { type: Number, default: null, min: 0 },
    actualAcquisitionCost: { type: Number, default: null, min: 0 },
    calculatedSourceCost: { type: Number, default: null, min: 0 },
    reason: { type: String, default: "" },
    reference: { type: String, default: "" },
    idempotencyKey: { type: String, unique: true, sparse: true },
    createdBy: { type: String, default: "Admin" },
    isVoided: { type: Boolean, default: false, index: true },
    voidReason: { type: String, default: "" },
  },
  { timestamps: true }
);

JewelleryLedgerSchema.index({ entryDate: -1, createdAt: -1 });
JewelleryLedgerSchema.index({ pieceId: 1, entryDate: 1 });

export default mongoose.models.JewelleryLedger ||
  mongoose.model("JewelleryLedger", JewelleryLedgerSchema);
