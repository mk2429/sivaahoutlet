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
    date: `${String(day).padStart(2, "0")}/${String(month).padStart(
      2,
      "0"
    )}/${year}`,
    silverRate,
    labourPerGram,
  };
}

export async function GET() {
  try {
    if (!(await isAdmin())) {
      return NextResponse.json(
        { success: false, message: "Unauthorized" },
        { status: 401 }
      );
    }

    const response = await fetch(ERP_URL, { cache: "no-store" });

    if (!response.ok) {
      throw new Error("ERP catalogue request failed");
    }

    const data = await response.json();

    const catalogue = Array.isArray(data)
      ? data
      : data.products || data.data || [];

    if (!Array.isArray(catalogue)) {
      throw new Error("Invalid ERP catalogue response");
    }

    await connectDB();

    const localProducts = await Product.find({}).lean();

    const byId = new Map(
      localProducts
        .filter((product) => product.erpProductId)
        .map((product) => [String(product.erpProductId), product])
    );

    const bySku = new Map(
      localProducts.map((product) => [product.sku, product])
    );

    const products = catalogue.map((source) => {
      const erpProductId = String(source._id);
      const sku = source.sku_id || `ERP-${source._id}`;

      const local = byId.get(erpProductId) || bySku.get(sku);

      const availablePieces = (local?.pieces || []).filter(
        (piece) => piece.status === "inStock"
      );

      const rawBatches = Array.isArray(source.batchids)
        ? source.batchids
        : [];

      // Only expose valid, uniquely identified ERP batches.
      const seenBatchIds = new Set();

      const batchids = rawBatches
        .map((batch) => {
          const decoded = decodeBatchId(batch?.batchid);
          if (!decoded || seenBatchIds.has(decoded.batchId)) return null;

          seenBatchIds.add(decoded.batchId);

          return {
            ...decoded,
            erpQuantity: Number(batch.quantity || 0),
          };
        })
        .filter(Boolean);

      return {
        erpProductId,
        sku,
        name: source.name || "",
        category: source.category || "",
        image: source.images?.[0] || "",
        mrp: Number(source.mrp || 0),
        grams:
          source.grams != null && Number.isFinite(Number(source.grams))
            ? Number(source.grams)
            : null,

        batchids,

        alreadyAdded: Boolean(local),
        currentStock: availablePieces.length,
        currentWeights: availablePieces.map((piece) => ({
          pieceId: String(piece._id),
          weight: piece.weight,
          batchId: piece.batchId || "",
        })),
      };
    });

    return NextResponse.json({ success: true, products });
  } catch (error) {
    console.error("Catalogue fetch error:", error);

    return NextResponse.json(
      { success: false, message: "Could not fetch ERP products" },
      { status: 502 }
    );
  }
}