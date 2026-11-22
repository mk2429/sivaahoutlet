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

    await connectDB();
    const localProducts = await Product.find({}).lean();

    // Fetch external ERP catalogue with a 12s timeout so ECONNRESET never blocks local products
    let catalogue = [];
    let erpWarning = "";

    try {
      const response = await fetch(ERP_URL, {
        cache: "no-store",
        signal: AbortSignal.timeout(12000),
      });

      if (!response.ok) {
        throw new Error("ERP catalogue request failed");
      }

      const data = await response.json();
      catalogue = Array.isArray(data)
        ? data
        : data.products || data.data || [];

      if (!Array.isArray(catalogue)) {
        catalogue = [];
      }
    } catch (erpErr) {
      console.error("ERP catalogue fetch warning:", erpErr);
      erpWarning = "ERP server unreachable; showing local & custom products.";
    }

    const byId = new Map(
      localProducts
        .filter((product) => product.erpProductId)
        .map((product) => [String(product.erpProductId), product])
    );

    const bySku = new Map(
      localProducts.map((product) => [product.sku, product])
    );

    const seenErpIds = new Set();

    // 1. Map ERP products
    const erpProducts = catalogue.map((source) => {
      const erpProductId = String(source._id);
      seenErpIds.add(erpProductId);

      const sku = source.sku_id || `ERP-${source._id}`;
      const local = byId.get(erpProductId) || bySku.get(sku);

      const availablePieces = (local?.pieces || []).filter(
        (piece) => piece.status === "inStock"
      );

      const rawBatches = Array.isArray(source.batchids)
        ? source.batchids
        : [];

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

    // 2. Include local-only / custom AYO- products (plus any synced products if ERP timed out)
    const customAndLocalOnlyProducts = localProducts
      .filter((local) => !seenErpIds.has(String(local.erpProductId)))
      .map((local) => {
        const availablePieces = (local.pieces || []).filter(
          (piece) => piece.status === "inStock"
        );

        // Expose any previously used batchIds on this local product as selectable options too
        const seenBatchIds = new Set();
        const batchids = (local.pieces || [])
          .map((p) => {
            const decoded = decodeBatchId(p?.batchId);
            if (!decoded || seenBatchIds.has(decoded.batchId)) return null;
            seenBatchIds.add(decoded.batchId);
            return decoded;
          })
          .filter(Boolean);

        return {
          erpProductId: String(local.erpProductId || local._id),
          sku: local.sku,
          name: local.name || "",
          category: local.category || "",
          image: local.image || local.images?.[0] || "",
          mrp: Number(local.mrp || 0),
          grams:
            local.grams != null && Number.isFinite(Number(local.grams))
              ? Number(local.grams)
              : null,
          isCustom: Boolean(local.sku?.startsWith("AYO-")),
          batchids,
          alreadyAdded: true,
          currentStock: availablePieces.length,
          currentWeights: availablePieces.map((piece) => ({
            pieceId: String(piece._id),
            weight: piece.weight,
            batchId: piece.batchId || "",
          })),
        };
      });

    const products = [...customAndLocalOnlyProducts, ...erpProducts];

    return NextResponse.json({
      success: true,
      products,
      warning: erpWarning || undefined,
    });
  } catch (error) {
    console.error("Catalogue fetch error:", error);

    return NextResponse.json(
      { success: false, message: "Could not fetch products" },
      { status: 500 }
    );
  }
}