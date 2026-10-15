import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import connectDB from "@/lib/db";
import Product from "@/app/models/Product";
import { verifyAdminToken } from "@/lib/admin-auth";

const ERP_URL = "https://sivaaherp.vercel.app/api/products/all";

async function isAdmin() {
  const token = (await cookies()).get("sivaah_admin_access")?.value;
  return token ? verifyAdminToken(token) : false;
}

function decodeBatchId(value) {
  const batchId = String(value || "").trim();

  if (!/^\d{14}$/.test(batchId)) return null;

  const day = Number(batchId.slice(0, 2));
  const month = Number(batchId.slice(2, 4));
  const year = Number(batchId.slice(4, 8));
  const silverRate = Number(batchId.slice(8, 11));
  const labourPerGram = Number(batchId.slice(11, 14));

  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day ||
    year < 2000 ||
    silverRate <= 0
  ) {
    return null;
  }

  return {
    batchId,
    silverRate,
    labourPerGram,
  };
}

export async function POST(request) {
  try {
    if (!(await isAdmin())) {
      return NextResponse.json(
        { success: false, message: "Unauthorized" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const erpProductId = String(body.erpProductId || "").trim();
    const pieces = body.pieces;

    if (
      !erpProductId ||
      !Array.isArray(pieces) ||
      pieces.length < 1 ||
      pieces.length > 100
    ) {
      return NextResponse.json(
        {
          success: false,
          message: "Select a product and enter between 1 and 100 pieces.",
        },
        { status: 400 }
      );
    }

    const invalidPiece = pieces.some((piece) => {
      const weight = Number(piece?.weight);
      const batchId = String(piece?.batchId || "").trim();

      return (
        piece?.weight === "" ||
        piece?.weight == null ||
        !Number.isFinite(weight) ||
        weight <= 0 ||
        !decodeBatchId(batchId)
      );
    });

    if (invalidPiece) {
      return NextResponse.json(
        {
          success: false,
          message: "Every piece needs a valid weight and batch ID.",
        },
        { status: 400 }
      );
    }

    await connectDB();

    // Verify product and batch IDs against the trusted ERP catalogue.
    const response = await fetch(ERP_URL, { cache: "no-store" });

    if (!response.ok) {
      throw new Error("Could not verify ERP product");
    }

    const data = await response.json();

    const catalogue = Array.isArray(data)
      ? data
      : data.products || data.data || [];

    if (!Array.isArray(catalogue)) {
      throw new Error("Invalid ERP catalogue response");
    }

    const source = catalogue.find(
      (item) => String(item._id) === erpProductId
    );

    if (!source) {
      return NextResponse.json(
        { success: false, message: "ERP product not found" },
        { status: 404 }
      );
    }

    const sku = source.sku_id || `ERP-${source._id}`;

    const erpBatchIds = new Set(
      (Array.isArray(source.batchids) ? source.batchids : [])
        .map((batch) => String(batch?.batchid || "").trim())
        .filter((batchId) => decodeBatchId(batchId))
    );

    const unknownBatch = pieces.find(
      (piece) => !erpBatchIds.has(String(piece.batchId).trim())
    );

    if (unknownBatch) {
      return NextResponse.json(
        {
          success: false,
          message:
            "A selected batch does not belong to this ERP product. Refresh and select a valid batch.",
        },
        { status: 400 }
      );
    }

    let product = await Product.findOne({
      $or: [{ erpProductId }, { sku }],
    });

    if (
      product?.erpProductId &&
      String(product.erpProductId) !== erpProductId
    ) {
      return NextResponse.json(
        { success: false, message: "Product identity conflict" },
        { status: 409 }
      );
    }

    if (product && product.sku !== sku) {
      return NextResponse.json(
        { success: false, message: "Product SKU conflict" },
        { status: 409 }
      );
    }

    if (!product) {
      product = new Product({
        erpProductId,
        sku,
        name: source.name || "",
        slug: source.slug || "",
        category: source.category || "",
        subtitle: source.subtitle || "",
        image: source.images?.[0] || "",
        images: source.images || [],
        material: source.material || "",
        mrp: Number(source.mrp || 0),
        grams: Number(source.grams || 0),
        pieces: [],
        stockQuantity: 0,
        active: source.isActive !== false,
      });
    }

    // Update catalogue metadata without replacing existing inventory.
    product.erpProductId = erpProductId;
    product.name = source.name || "";
    product.slug = source.slug || "";
    product.category = source.category || "";
    product.subtitle = source.subtitle || "";
    product.image = source.images?.[0] || "";
    product.images = source.images || [];
    product.material = source.material || "";
    product.mrp = Number(source.mrp || 0);
    product.grams = Number(source.grams || 0);
    product.lastSyncedAt = new Date();

    const receivedAt = new Date();

    product.pieces.push(
      ...pieces.map((piece) => ({
        weight: Number(piece.weight),
        batchId: String(piece.batchId).trim(),
        status: "inStock",
        receivedAt,
      }))
    );

    product.stockQuantity = product.pieces.filter(
      (piece) => piece.status === "inStock"
    ).length;

    await product.save();

    const availablePieces = product.pieces.filter(
      (piece) => piece.status === "inStock"
    );

    return NextResponse.json({
      success: true,
      message: "Pieces added successfully",
      product: {
        name: product.name,
        sku: product.sku,
        stockQuantity: product.stockQuantity,
        availablePieces: availablePieces.map((piece) => ({
          pieceId: String(piece._id),
          weight: piece.weight,
          batchId: piece.batchId || "",
        })),
      },
    });
  } catch (error) {
    console.error("Add stock error:", error);

    if (error.code === 11000) {
      return NextResponse.json(
        { success: false, message: "Duplicate SKU detected" },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { success: false, message: "Could not add stock" },
      { status: 500 }
    );
  }
}