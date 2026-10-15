import mongoose from "mongoose";

const SilverRateSchema = new mongoose.Schema(
  {
    metal: {
      type: String,
      default: "silver",
      unique: true,
    },
    ratePerGram: {
      type: Number,
      required: true,
      min: 0.01,
    },
    updatedBy: {
      type: String,
      default: "Admin",
    },
  },
  { timestamps: true }
);

export default mongoose.models.SilverRate ||
  mongoose.model("SilverRate", SilverRateSchema);