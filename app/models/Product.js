
import mongoose from "mongoose";

const PieceSchema = new mongoose.Schema(
  {
    weight: {
      type: Number,
      required: true,
      min: 0.001,
    },
    status: {
      type: String,
      enum: ["inStock", "sold"],
      default: "inStock",
    },
    receivedAt: {
      type: Date,
      default: Date.now,
    },
    batchId: {
      type: String,
      default: "",
    },
  },
  { timestamps: true }
);

const ProductSchema = new mongoose.Schema(
  {
    erpProductId: {
      type: String,
      default: null,
      index: true,
    },
    sku: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    slug: { type: String, default: "" },
    category: { type: String, default: "" },
    subtitle: { type: String, default: "" },
    image: { type: String, default: "" },
    images: { type: [String], default: [] },
    material: { type: String, default: "" },
    mrp: { type: Number, default: 0, min: 0 },
    grams: { type: Number, default: 0, min: 0 },

    // Actual physical pieces in the outlet
    pieces: {
      type: [PieceSchema],
      default: [],
    },

    // Maintained for quick inventory summaries
    stockQuantity: {
      type: Number,
      default: 0,
      min: 0,
    },

    lowStockAlert: {
      type: Number,
      default: 2,
      min: 0,
    },
    active: {
      type: Boolean,
      default: true,
    },
    lastSyncedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

ProductSchema.index({ name: "text", sku: "text" });

export default mongoose.models.Product ||
  mongoose.model("Product", ProductSchema);
