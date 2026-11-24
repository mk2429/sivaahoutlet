import { NextResponse } from "next/server";
import mongoose from "mongoose";

import connectDB from "../../../../lib/db";

import Product from "../../../models/Product";
import Customer from "../../../models/Customer";
import Discount from "../../../models/Discount";

function roundSellingPrice(price) {
  if (!Number.isFinite(price) || price <= 0) return null;

  const hundred = Math.floor(price / 100) * 100;
  const remainder = price - hundred;

  return remainder < 50 ? hundred - 1 : hundred + 99;
}

function decodeBatch(batchId) {
  const id = String(batchId || "");

  if (!/^\d{14}$/.test(id)) return null;

  return {
    labourPerGram: Number(id.slice(11, 14)),
  };
}

export async function GET() {
  try {
    await connectDB();

    const [customers, products, discounts, rateDoc] = await Promise.all([
      Customer.find({}).sort({ name: 1 }).limit(2000).lean(),

      Product.find({ active: { $ne: false } }).lean(),

      Discount.find({ active: true }).sort({ name: 1 }).lean(),

      mongoose.connection.db
        .collection("silverrates")
        .findOne({ metal: "silver" }),
    ]);

    const silverRate = Number(rateDoc?.ratePerGram || 0);
    const pieces = [];

    for (const product of products) {
      for (const piece of product.pieces || []) {
        if (piece.status !== "inStock") continue;

        const batch = decodeBatch(piece.batchId);

        if (!batch || silverRate <= 0) continue;

        const weight = Number(piece.weight || 0);

        if (!Number.isFinite(weight) || weight <= 0) continue;

        const costToday = weight * (silverRate + batch.labourPerGram) + 50;

        const listPrice = roundSellingPrice(
          costToday / ((1 - 0.15) * (1 - 0.25))
        );

        if (!listPrice) continue;

        pieces.push({
          productId: String(product._id),
          pieceId: String(piece._id),
          name: product.name,
          sku: product.sku || "",
          category: product.category || "",
          image: product.image || product.images?.[0] || "",
          batchId: piece.batchId,
          weight,
          listPrice,
        });
      }
    }

    return NextResponse.json({
      customers: customers.map((customer) => ({
        _id: String(customer._id),
        name: customer.name || "",
        whatsappNumber: customer.whatsappNumber || "",
        address: customer.address || "",
        walletBalance: Number(customer.walletBalance || 0),
      })),

      pieces,

      discounts: discounts.map((discount) => ({
        _id: String(discount._id),
        name: discount.name || "",
        type: discount.type || "percentage",
        value: Number(discount.value || 0),
        applicability: discount.applicability || "all",
        categories: discount.categories || [],
        skus: discount.skus || [],
        minBillAmount: Number(discount.minBillAmount || 0),
        minWeightGrams: Number(discount.minWeightGrams || 0),
        startDate: discount.startDate || null,
        endDate: discount.endDate || null,
      })),

      silverRate,
    });
  } catch (error) {
    console.error("Sale options error:", error);

    return NextResponse.json(
      { error: "Unable to load sale options." },
      { status: 500 }
    );
  }
}