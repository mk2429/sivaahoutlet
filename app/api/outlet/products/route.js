
import { NextResponse } from "next/server";
import mongoose from "mongoose";

import connectDB from "@/lib/db";
import Product from "@/app/models/Product";
import Discount from "@/app/models/Discount";

import {
  decodeBatchId,
  calculatePiecePricing,
} from "@/lib/pricing";

function isValidNow(discount, now) {
  if (!discount.active) return false;
  if (discount.startDate && new Date(discount.startDate) > now) return false;
  if (discount.endDate && new Date(discount.endDate) < now) return false;
  return true;
}

function getMatchingOffers(product, weight, sp, discounts) {
  const sku = String(product.sku || "").trim().toUpperCase();
  const category = String(product.category || "").trim();

  return discounts
    .filter((discount) => {
      if (discount.applicability === "sku") {
        return (discount.skus || []).some(
          (value) => String(value).trim().toUpperCase() === sku
        );
      }

      if (discount.applicability === "category") {
        return (discount.categories || []).some(
          (value) => String(value).trim() === category
        );
      }

      return discount.applicability === "all";
    })
    .map((discount) => {
      const meetsWeight =
        Number(discount.minWeightGrams || 0) <= weight;

      const needsBillAmount =
        Number(discount.minBillAmount || 0) > 0;

      const needsCombinedWeight =
        Number(discount.minWeightGrams || 0) > weight;

      const rawDiscount =
        discount.type === "percentage"
          ? (sp * Number(discount.value)) / 100
          : Number(discount.value);

      const price = Math.max(0, Math.round(sp - rawDiscount));

      const criteria = [];

      if (discount.applicability === "sku") {
        criteria.push(`Applicable to SKU: ${(discount.skus || []).join(", ")}`);
      } else if (discount.applicability === "category") {
        criteria.push(
          `Applicable to category: ${(discount.categories || []).join(", ")}`
        );
      } else {
        criteria.push("Applicable to all products");
      }

      if (Number(discount.minBillAmount || 0) > 0) {
        criteria.push(
          `Minimum bill amount: ₹${Number(discount.minBillAmount).toLocaleString("en-IN")}`
        );
      }

      if (Number(discount.minWeightGrams || 0) > 0) {
        criteria.push(
          `Minimum eligible weight: ${Number(discount.minWeightGrams)} g`
        );
      }

      if (discount.startDate) {
        criteria.push(
          `Valid from ${new Date(discount.startDate).toLocaleDateString("en-IN")}`
        );
      }

      if (discount.endDate) {
        criteria.push(
          `Valid until ${new Date(discount.endDate).toLocaleDateString("en-IN")}`
        );
      }

      return {
        id: String(discount._id),
        name: discount.name,
        type: discount.type,
        value: Number(discount.value),
        price,
        amountOff: Math.max(0, sp - price),
        criteria,
        requiresBillCheck: needsBillAmount || needsCombinedWeight,
        meetsPieceWeight: meetsWeight,
        minBillAmount: Number(discount.minBillAmount || 0),
        minWeightGrams: Number(discount.minWeightGrams || 0),
      };
    })
    .sort((a, b) => {
      const savingDifference = b.amountOff - a.amountOff;
      if (savingDifference !== 0) return savingDifference;
      return a.name.localeCompare(b.name);
    });
}

export async function GET() {
  try {
    await connectDB();

    const db = mongoose.connection.db;
    if (!db) throw new Error("Database connection unavailable");

    const silverRateDoc = await db
      .collection("silverrates")
      .findOne({ metal: "silver" });

    const currentSilverRate = Number(silverRateDoc?.ratePerGram || 0);

    if (!Number.isFinite(currentSilverRate) || currentSilverRate <= 0) {
      return NextResponse.json(
        {
          success: false,
          message: "Current silver rate is missing. Update it in Silver Rate Settings first.",
        },
        { status: 400 }
      );
    }

    const [products, rawDiscounts] = await Promise.all([
      Product.find({
        active: true,
        "pieces.status": "inStock",
      }).lean(),
      Discount.find({ active: true }).lean(),
    ]);

    const now = new Date();
    const discounts = rawDiscounts.filter((item) => isValidNow(item, now));
    const inventory = [];

    for (const product of products) {
      for (const piece of product.pieces || []) {
        if (piece.status !== "inStock") continue;

        const weight = Number(piece.weight);
        const batch = decodeBatchId(piece.batchId);

        const pricing = calculatePiecePricing({
          weight,
          batch,
          currentSilverRate,
        });

        if (pricing.pricingStatus !== "Ready" || pricing.sp == null) {
          continue;
        }

        const offers = getMatchingOffers(
          product,
          weight,
          pricing.sp,
          discounts
        );

        inventory.push({
          productId: String(product._id),
          pieceId: String(piece._id),
          name: product.name || "",
          sku: product.sku || "",
          category: product.category || "Uncategorised",
          barcode: product.barcode || product.sku || "",
          image: product.image || product.images?.[0] || "",
          batchId: piece.batchId || "",
          weight,
          sp: pricing.sp,

          // All matching active offers, for the rates popup.
          discountOffers: offers,

          // Retain compatibility with the current dashboard while migrating.
          discount: offers.find((offer) => !offer.requiresBillCheck) || null,
          spAfterDiscount:
            offers.find((offer) => !offer.requiresBillCheck)?.price ?? null,

          discountNeedsBillCheck: offers.some(
            (offer) => offer.requiresBillCheck
          ),
        });
      }
    }

    inventory.sort((a, b) => a.name.localeCompare(b.name));

    return NextResponse.json({
      success: true,
      currentSilverRate,
      totalPieces: inventory.length,
      categories: [
        ...new Set(inventory.map((item) => item.category)),
      ].sort(),
      products: inventory,
    });
  } catch (error) {
    console.error("Outlet products API error:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Could not load outlet inventory.",
      },
      { status: 500 }
    );
  }
}
