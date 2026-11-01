
import mongoose from "mongoose";

const SilverMatchSchema = new mongoose.Schema(
    {
        saleId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Sale",
            required: true,
            index: true,
        },

        pieceId: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
            index: true,
        },

        // Original outward sale entry
        saleLedgerEntryId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "JewelleryLedger",
            required: true,
            index: true,
        },

        // Replacement inward stock entry
        replacementLedgerEntryId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "JewelleryLedger",
            required: true,
            index: true,
        },

        matchedGrams: {
            type: Number,
            required: true,
            min: 0.001,
            validate: {
                validator: (value) =>
                    Number.isFinite(value) &&
                    Math.abs(value * 1000 - Math.round(value * 1000)) < 0.000001,
                message: "Matched weight must have a maximum of 3 decimal places.",
            },
        },

        saleSilverRatePerGram: {
            type: Number,
            required: true,
            min: 0,
        },

        replacementSilverRatePerGram: {
            type: Number,
            required: true,
            min: 0,
        },

        // Integer paise; positive = gain, negative = loss
        adjustmentPaise: {
            type: Number,
            required: true,
            validate: {
                validator: Number.isSafeInteger,
                message: "Adjustment must be stored in integer paise.",
            },
        },

        matchDate: {
            type: Date,
            required: true,
            default: Date.now,
            index: true,
        },

        status: {
            type: String,
            enum: ["confirmed", "reversed"],
            default: "confirmed",
            index: true,
        },

        reversalOf: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "SilverMatch",
            default: null,
        },

        reversedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "SilverMatch",
            default: null,
        },

        reversalReason: {
            type: String,
            trim: true,
            maxlength: 500,
            default: "",
        },

        notes: {
            type: String,
            trim: true,
            maxlength: 1000,
            default: "",
        },

        createdBy: {
            type: String,
            trim: true,
            default: "admin",
        },
    },
    { timestamps: true }
);

SilverMatchSchema.index({ matchDate: 1, status: 1 });
SilverMatchSchema.index({ saleLedgerEntryId: 1, status: 1 });
SilverMatchSchema.index({ replacementLedgerEntryId: 1, status: 1 });

export default mongoose.models.SilverMatch ||
    mongoose.model("SilverMatch", SilverMatchSchema);
