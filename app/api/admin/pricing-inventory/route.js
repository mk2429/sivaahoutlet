
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import mongoose from "mongoose";

import connectDB from "@/lib/db";
import Product from "@/app/models/Product";
import { verifyAdminToken } from "@/lib/admin-auth";
import {
  PACKAGING_COST,
  decodeBatchId,
  calculatePiecePricing,
} from "@/lib/pricing";

async function isAdmin() {
  const token = (await cookies()).get("sivaah_admin_access")?.value;
  return token ? verifyAdminToken(token) : false;
}

export async function GET() {
  try {
    if (!(await isAdmin())) {
      return NextResponse.json(
        { success: false, message: "Unauthorized" },
        { status: 401 }
      );
    }

    await connectDB();

    const db = mongoose.connection.db;

    if (!db) {
      throw new Error("Database connection unavailable");
    }

    const silverRateDoc = await db
      .collection("silverrates")
      .findOne({ metal: "silver" });

    const currentSilverRate = Number(silverRateDoc?.ratePerGram || 0);

    if (!Number.isFinite(currentSilverRate) || currentSilverRate <= 0) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Current silver rate is missing. Update it in Silver Rate Settings first.",
        },
        { status: 400 }
      );
    }

    const products = await Product.find({}).lean();
    const inventory = [];

    for (const product of products) {
      const availablePieces = (product.pieces || []).filter(
        (piece) => piece.status === "inStock"
      );

      for (const piece of availablePieces) {
        const weight = Number(piece.weight);
        const batch = decodeBatchId(piece.batchId);

        const pricing = calculatePiecePricing({
          weight,
          batch,
          currentSilverRate,
        });

        inventory.push({
          productId: String(product._id),
          pieceId: String(piece._id),
          erpProductId: product.erpProductId || "",
          sku: product.sku || "",
          name: product.name || "",
          category: product.category || "",
          image: product.image || product.images?.[0] || "",

          weight:
            Number.isFinite(weight) && weight > 0 ? weight : null,

          batchId: piece.batchId || "",
          batchDate: batch?.batchDate || "",

          currentSilverRate,
          sourceSilverRate: batch?.sourceSilverRate ?? null,
          labourPerGram: batch?.labourPerGram ?? null,

          packagingCost: PACKAGING_COST,

          sp: pricing.sp,
          spAfterDiscount: pricing.spAfterDiscount,
          cpToday: pricing.cpToday,
          cpSource: pricing.cpSource,
          pricingStatus: pricing.pricingStatus,
        });
      }
    }

    inventory.sort((a, b) => a.name.localeCompare(b.name));

    return NextResponse.json({
      success: true,
      currentSilverRate,
      packagingCost: PACKAGING_COST,
      totalPieces: inventory.length,
      readyPieces: inventory.filter(
        (item) => item.pricingStatus === "Ready"
      ).length,
      inventory,
    });
  } catch (error) {
    console.error("Pricing inventory error:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Could not load pricing inventory.",
      },
      { status: 500 }
    );
  }
}
