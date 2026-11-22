import { NextResponse } from "next/server";
import mongoose from "mongoose";
import dbConnect from "@/lib/db"; // adjust to your DB connection import
import Product from "@/app/models/Product"; // adjust to your Product model path

const IGNORED_WORDS = new Set([
  "925",
  "sterling",
  "silver",
  "pure",
  "hallmarked",
  "with",
  "for",
  "and",
  "the",
  "of",
  "in",
  "a",
  "an",
]);

function generateBaseSku(category, name) {
  // First 3 letters of category (e.g., "Pendants" -> "PEN")
  const catCode = String(category || "GEN")
    .replace(/[^a-zA-Z]/g, "")
    .slice(0, 3)
    .toUpperCase()
    .padEnd(3, "X");

  // First letters of product name excluding "925", "Sterling", "Silver", etc.
  const words = String(name || "")
    .replace(/[^a-zA-Z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w && !IGNORED_WORDS.has(w.toLowerCase()));

  const initials = words
    .slice(0, 4) // up to 3-4 initials like MFC
    .map((w) => w[0].toUpperCase())
    .join("") || "PRD";

  return `AYO-${catCode}-${initials}`;
}

async function getUniqueSku(category, name) {
  const baseSku = generateBaseSku(category, name);
  const existing = await Product.find({
    sku: { $regex: `^${baseSku}-\\d+$`, $options: "i" },
  })
    .select("sku")
    .lean();

  if (!existing.length) return `${baseSku}-1`;

  let maxNum = 0;
  for (const item of existing) {
    const parts = item.sku.split("-");
    const num = Number(parts[parts.length - 1]);
    if (Number.isFinite(num) && num > maxNum) {
      maxNum = num;
    }
  }
  return `${baseSku}-${maxNum + 1}`;
}

function makeSlug(text) {
  return String(text || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function POST(request) {
  try {
    await dbConnect();

    const body = await request.json();
    const {
      name,
      category,
      subtitle = "",
      image = "",
      material = "925 Silver",
      mrp = 0,
      grams = 0,
      lowStockAlert = 2,
    } = body;

    if (!name?.trim() || !category?.trim()) {
      return NextResponse.json(
        { success: false, message: "Product name and category are required." },
        { status: 400 }
      );
    }

    const sku = await getUniqueSku(category, name);
    const baseSlug = makeSlug(name);
    const slugExists = await Product.exists({ slug: baseSlug });
    const slug = slugExists ? `${baseSlug}-${sku.toLowerCase()}` : baseSlug;

    // Generate a unique erpProductId so the existing purchase flow treats it identically
    const erpProductId = new mongoose.Types.ObjectId().toString();

    const newProduct = await Product.create({
      erpProductId,
      sku,
      name: name.trim(),
      slug,
      category: category.trim(),
      subtitle: subtitle.trim(),
      image: image.trim(),
      images: image.trim() ? [image.trim()] : [],
      material: material.trim() || "925 Silver",
      mrp: Number(mrp) || 0,
      grams: Number(grams) || 0,
      pieces: [],
      stockQuantity: 0,
      lowStockAlert: Number(lowStockAlert) || 2,
      active: true,
      isWebsiteProduct: false, // optional flag to distinguish non-website items
      lastSyncedAt: new Date(),
    });

    return NextResponse.json({
      success: true,
      message: `Product created with SKU ${sku}`,
      product: {
        ...newProduct.toObject(),
        currentStock: 0,
        currentWeights: [],
        alreadyAdded: false,
        batchids: [],
      },
    });
  } catch (error) {
    console.error("Error creating custom product:", error);
    return NextResponse.json(
      { success: false, message: error.message || "Failed to create product." },
      { status: 500 }
    );
  }
}