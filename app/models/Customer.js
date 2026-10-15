
import mongoose from "mongoose";

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
      enum: [
        "Female",
        "Male",
        "Other",
        "Prefer not to say",
      ],
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
  },
  { timestamps: true }
);

CustomerSchema.index({
  name: "text",
  whatsappNumber: "text",
});

export default mongoose.models.Customer ||
  mongoose.model("Customer", CustomerSchema);
