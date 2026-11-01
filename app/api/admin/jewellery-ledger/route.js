import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import mongoose from "mongoose";

import connectDB from "@/lib/db";
import Product from "@/app/models/Product";
import JewelleryLedger from "@/app/models/JewelleryLedger";
import { verifyAdminToken } from "@/lib/admin-auth";
import { decodeBatchId, calculatePiecePricing } from "@/lib/pricing";

async function authorized() {
  try {
    const token = (await cookies()).get("sivaah_admin_access")?.value;
    return token ? Boolean(await verifyAdminToken(token)) : false;
  } catch {
    return false;
  }
}

function error(message, status = 400) {
  return NextResponse.json({ success: false, message }, { status });
}

function dateFilter(from, to) {
  const filter = {};

  if (from || to) {
    filter.entryDate = {};

    if (from) {
      filter.entryDate.$gte = new Date(`${from}T00:00:00+05:30`);
    }

    if (to) {
      filter.entryDate.$lte = new Date(`${to}T23:59:59.999+05:30`);
    }
  }

  return filter;
}

function round(value, decimals = 2) {
  const factor = 10 ** decimals;
  return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
}

function validRate(value) {
  if (value === null || value === undefined || value === "") return null;

  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

export async function GET(request) {
  if (!(await authorized())) {
    return error("Unauthorized", 401);
  }

  try {
    await connectDB();

    const { searchParams } = new URL(request.url);
    const from = searchParams.get("from") || "";
    const to = searchParams.get("to") || "";

    // Date filters apply to movement history, not current stock.
    const movements = await JewelleryLedger.find({
      isVoided: false,
      ...dateFilter(from, to),
    })
      .sort({ entryDate: -1, createdAt: -1 })
      .lean();

    const products = await Product.find({})
      .select("name sku pieces")
      .lean();

    let totalPieces = 0;
    let totalWeight = 0;

    let silverRateWeight = 0;
    let silverRateValue = 0;
    let piecesWithUnknownSilverRate = 0;

    let labourRateWeight = 0;
    let labourRateValue = 0;
    let piecesWithUnknownLabourRate = 0;

    // Calculate averages from physical pieces currently in stock.
    for (const product of products) {
      for (const piece of product.pieces || []) {
        if (piece.status !== "inStock") continue;

        const weight = Number(piece.weight);

        if (!Number.isFinite(weight) || weight <= 0) continue;

        totalPieces += 1;
        totalWeight += weight;

        // Prefer the actual rate saved on the piece.
        // Fall back to a rate decoded from the batch, if available.
        let batch = null;

        try {
          if (piece.batchId) {
            batch = decodeBatchId(piece.batchId);
          }
        } catch {
          batch = null;
        }

        const silverRate =
          validRate(piece.acquisitionSilverRate) ??
          validRate(batch?.sourceSilverRate);

        const labourRate =
          validRate(piece.acquisitionLabourPerGram) ??
          validRate(batch?.labourPerGram);

        if (silverRate !== null) {
          silverRateValue += weight * silverRate;
          silverRateWeight += weight;
        } else {
          piecesWithUnknownSilverRate += 1;
        }

        if (labourRate !== null) {
          labourRateValue += weight * labourRate;
          labourRateWeight += weight;
        } else {
          piecesWithUnknownLabourRate += 1;
        }
      }
    }

    // Ledger balance is separate from physical stock.
    const allMovements = await JewelleryLedger.find({
      isVoided: false,
    })
      .select("direction weight")
      .lean();

    const ledgerNetWeight = allMovements.reduce((sum, entry) => {
      const weight = Number(entry.weight) || 0;
      return sum + (entry.direction === "in" ? weight : -weight);
    }, 0);

    const averageSilverRatePerGram =
      silverRateWeight > 0
        ? silverRateValue / silverRateWeight
        : null;

    const averageLabourPerGram =
      labourRateWeight > 0
        ? labourRateValue / labourRateWeight
        : null;

    const roundedWeight = round(totalWeight, 3);
    const roundedLedgerWeight = round(ledgerNetWeight, 3);

    return NextResponse.json({
      success: true,
      summary: {
        totalPieces,
        totalWeight: roundedWeight,

        // These are the requested averages.
        averageSilverRatePerGram:
          averageSilverRatePerGram === null
            ? null
            : round(averageSilverRatePerGram, 2),

        averageLabourPerGram:
          averageLabourPerGram === null
            ? null
            : round(averageLabourPerGram, 2),

        piecesWithUnknownSilverRate,
        piecesWithUnknownLabourRate,

        // Keep legacy fields for compatibility with existing screens.
        // These are not used to calculate the silver-rate average.
        knownAcquisitionValue: 0,
        averageAcquisitionCostPerGram: null,
        piecesWithUnknownCost: totalPieces,
        unknownCostPieces: totalPieces,

        ledgerNetWeight: roundedLedgerWeight,
        reconciliationRequired:
          Math.abs(roundedWeight - roundedLedgerWeight) > 0.01,
      },
      movements,
    });
  } catch (e) {
    console.error("Jewellery ledger GET:", e);
    return error("Unable to load jewellery ledger", 500);
  }
}

export async function POST(request) {
  if (!(await authorized())) {
    return error("Unauthorized", 401);
  }

  let session;

  try {
    await connectDB();

    const body = await request.json();

    const {
      movementType,
      productId,
      pieceId,
      weight,
      entryDate,
      reason = "",
      reference = "",
      actualAcquisitionCost = null,
      idempotencyKey,
    } = body;

    const allowedTypes = [
      "opening_stock",
      "adjustment_in",
      "adjustment_out",
    ];

    if (!allowedTypes.includes(movementType)) {
      return error(
        "This endpoint only accepts opening stock and manual adjustments. Stock additions and sales must use their normal routes."
      );
    }

    if (!mongoose.Types.ObjectId.isValid(productId)) {
      return error("Valid productId is required");
    }

    const grams = Number(weight);

    if (!Number.isFinite(grams) || grams <= 0) {
      return error("Weight must be greater than zero");
    }

    if (!entryDate || Number.isNaN(new Date(entryDate).getTime())) {
      return error("A valid entry date is required");
    }

    if (!String(reason).trim()) {
      return error("A reason is required for opening stock or adjustments");
    }

    if (
      actualAcquisitionCost !== null &&
      actualAcquisitionCost !== "" &&
      (!Number.isFinite(Number(actualAcquisitionCost)) ||
        Number(actualAcquisitionCost) < 0)
    ) {
      return error("Actual acquisition cost must be zero or greater");
    }

    if (idempotencyKey) {
      const existing = await JewelleryLedger.findOne({
        idempotencyKey,
      }).lean();

      if (existing) {
        return NextResponse.json({
          success: true,
          movement: existing,
          duplicate: true,
        });
      }
    }

    session = await mongoose.startSession();

    let created;

    await session.withTransaction(async () => {
      const product = await Product.findById(productId).session(session);

      if (!product) {
        throw new Error("Product not found");
      }

      let piece;

      if (
        movementType === "opening_stock" ||
        movementType === "adjustment_in"
      ) {
        piece = product.pieces.create({
          weight: grams,
          status: "inStock",
          receivedAt: new Date(entryDate),
          acquisitionDate: new Date(entryDate),
          actualAcquisitionCost:
            actualAcquisitionCost === null ||
            actualAcquisitionCost === ""
              ? null
              : Number(actualAcquisitionCost),
        });

        product.pieces.push(piece);
      } else {
        if (!mongoose.Types.ObjectId.isValid(pieceId)) {
          throw new Error(
            "A valid pieceId is required for an outward adjustment"
          );
        }

        piece = product.pieces.id(pieceId);

        if (!piece || piece.status !== "inStock") {
          throw new Error("Piece not found or is not in stock");
        }

        if (Math.abs(Number(piece.weight) - grams) > 0.001) {
          throw new Error(
            "Weight must match the selected piece's recorded weight"
          );
        }

        piece.status = "damaged";
      }

      product.stockQuantity = product.pieces.filter(
        (p) => p.status === "inStock"
      ).length;

      await product.save({ session });

      let batch = null;

      try {
        if (piece.batchId) batch = decodeBatchId(piece.batchId);
      } catch {
        batch = null;
      }

      const rateDoc = await mongoose.connection.db
        .collection("silverrates")
        .findOne({ metal: "silver" });

      let calculatedSourceCost = piece.calculatedSourceCost ?? null;

      if (calculatedSourceCost == null && batch) {
        const pricing = calculatePiecePricing({
          weight: grams,
          batch,
          currentSilverRate: Number(rateDoc?.ratePerGram),
        });

        calculatedSourceCost = pricing.cpSource ?? null;
      }

      const [ledgerEntry] = await JewelleryLedger.create(
        [
          {
            entryDate: new Date(entryDate),
            movementType,
            direction: movementType === "adjustment_out" ? "out" : "in",
            productId: product._id,
            pieceId: piece._id,
            sku: product.sku,
            productName: product.name,
            batchId: piece.batchId || "",
            weight: grams,
            sourceSilverRate:
              piece.acquisitionSilverRate ?? batch?.sourceSilverRate ?? null,
            labourPerGram:
              piece.acquisitionLabourPerGram ?? batch?.labourPerGram ?? null,
            actualAcquisitionCost:
              piece.actualAcquisitionCost ?? null,
            calculatedSourceCost,
            reason: String(reason).trim().slice(0, 500),
            reference: String(reference).trim().slice(0, 120),
            idempotencyKey: idempotencyKey || undefined,
          },
        ],
        { session }
      );

      created = ledgerEntry;
    });

    return NextResponse.json(
      { success: true, movement: created },
      { status: 201 }
    );
  } catch (e) {
    console.error("Jewellery ledger POST:", e);

    if (e.code === 11000) {
      return error("This ledger entry already exists.", 409);
    }

    if (e.message === "Product not found") {
      return error(e.message, 404);
    }

    return error(e.message || "Unable to record jewellery movement", 500);
  } finally {
    if (session) {
      await session.endSession();
    }
  }
}