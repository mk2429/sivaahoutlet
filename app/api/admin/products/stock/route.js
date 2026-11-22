import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import mongoose from "mongoose";
import { randomUUID } from "crypto";

import connectDB from "@/lib/db";
import Product from "@/app/models/Product";
import JewelleryLedger from "@/app/models/JewelleryLedger";
import OutletPurchase from "@/app/models/OutletPurchase";
import OutletTransaction from "@/app/models/OutletTransaction";

import { verifyAdminToken } from "@/lib/admin-auth";
import { decodeBatchId } from "@/lib/pricing";

const ERP_URL = "https://sivaaherp.vercel.app/api/products/all";

const PAYMENT_METHODS = [
  "Cash",
  "UPI",
  "Bank Transfer",
  "Card",
  "Other",
];

async function isAdmin() {
  try {
    const token = (await cookies()).get("sivaah_admin_access")?.value;
    return token ? Boolean(await verifyAdminToken(token)) : false;
  } catch {
    return false;
  }
}

function errorResponse(message, status = 400) {
  return NextResponse.json(
    { success: false, message },
    { status }
  );
}

function moneyToPaise(value, label) {
  const number = Number(value ?? 0);

  if (!Number.isFinite(number) || number < 0) {
    throw new Error(`${label} must be zero or greater.`);
  }

  return Math.round(number * 100);
}

function paiseToRupees(value) {
  return Number((value / 100).toFixed(2));
}

function getRate(value, fallback, label, batchId) {
  const rate =
    value === undefined || value === null || value === ""
      ? Number(fallback)
      : Number(value);

  if (!Number.isFinite(rate) || rate < 0) {
    throw new Error(
      `${label} must be valid for batch ${batchId}.`
    );
  }

  return rate;
}

function getAccount(method) {
  return method === "Cash" ? "Cash" : "Bank";
}

function validDate(value, fallback) {
  if (!value) return fallback;

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new Error("Invalid purchase date.");
  }

  return date;
}

export async function POST(request) {
  let session;

  try {
    if (!(await isAdmin())) {
      return errorResponse("Unauthorized", 401);
    }

    const body = await request.json();
    const inputProducts = body.products;
    const purchase = body.purchase || {};

    if (
      !Array.isArray(inputProducts) ||
      inputProducts.length < 1 ||
      inputProducts.length > 50
    ) {
      return errorResponse(
        "Add between 1 and 50 different products."
      );
    }

    const supplierName = String(
      purchase.supplierName || ""
    ).trim().slice(0, 150);

    if (!supplierName) {
      return errorResponse("Supplier name is required.");
    }

    const supplierPhone = String(
      purchase.supplierPhone || ""
    ).trim().slice(0, 20);

    const invoiceNumber = String(
      purchase.invoiceNumber || ""
    ).trim().slice(0, 120);

    const reference = String(
      purchase.reference || ""
    ).trim().slice(0, 120);

    const notes = String(
      purchase.notes || ""
    ).trim().slice(0, 1000);

    const gstPaise = moneyToPaise(purchase.gst, "GST");
    const transportPaise = moneyToPaise(
      purchase.transport,
      "Transport cost"
    );
    const otherChargesPaise = moneyToPaise(
      purchase.otherCharges,
      "Other charges"
    );

    // Validate product groups and pieces.
    const productIds = new Set();
    let totalInputPieces = 0;

    for (const group of inputProducts) {
      const erpProductId = String(
        group?.erpProductId || ""
      ).trim();

      if (!erpProductId) {
        return errorResponse("A product is missing its ERP ID.");
      }

      if (productIds.has(erpProductId)) {
        return errorResponse(
          "The same product cannot be added twice. Combine its pieces into one product entry."
        );
      }

      productIds.add(erpProductId);

      if (
        !Array.isArray(group.pieces) ||
        group.pieces.length < 1
      ) {
        return errorResponse(
          "Every selected product must have at least one piece."
        );
      }

      totalInputPieces += group.pieces.length;

      for (const piece of group.pieces) {
        const weight = Number(piece?.weight);
        const batchId = String(
          piece?.batchId || ""
        ).trim();

        if (
          piece?.weight === "" ||
          piece?.weight == null ||
          !Number.isFinite(weight) ||
          weight <= 0 ||
          !decodeBatchId(batchId)
        ) {
          return errorResponse(
            "Every piece needs a valid weight and batch ID."
          );
        }
      }
    }

    if (totalInputPieces > 500) {
      return errorResponse(
        "A single purchase cannot contain more than 500 pieces."
      );
    }

    await connectDB();

    // Check MongoDB first so custom AYO- products don't require an external ERP fetch
    const existingLocalDocs = await Product.find({
      erpProductId: { $in: Array.from(productIds) },
    }).lean();

    const localByErpId = new Map(
      existingLocalDocs.map((doc) => [String(doc.erpProductId), doc])
    );

    const needsErpFetch = inputProducts.some((group) => {
      const localDoc = localByErpId.get(String(group.erpProductId).trim());
      return !(localDoc && String(localDoc.sku || "").startsWith("AYO-"));
    });

    let catalogue = [];

    if (needsErpFetch) {
      const response = await fetch(ERP_URL, {
        cache: "no-store",
        signal: AbortSignal.timeout(15000),
      });

      if (!response.ok) {
        throw new Error("Could not verify ERP product catalogue.");
      }

      const data = await response.json();

      catalogue = Array.isArray(data)
        ? data
        : data.products || data.data || [];

      if (!Array.isArray(catalogue)) {
        throw new Error("Invalid ERP catalogue response.");
      }
    }

    const receivedAt = new Date();
    const purchaseDate = validDate(
      purchase.purchaseDate,
      receivedAt
    );

    const preparedGroups = [];

    for (const group of inputProducts) {
      const erpProductId = String(group.erpProductId).trim();
      const localCustomDoc = localByErpId.get(erpProductId);
      const isCustomProduct = Boolean(
        localCustomDoc && String(localCustomDoc.sku || "").startsWith("AYO-")
      );

      let sku;
      let source;
      let erpBatchIds = null;

      if (isCustomProduct) {
        sku = localCustomDoc.sku;
        source = {
          name: localCustomDoc.name || "",
          slug: localCustomDoc.slug || "",
          category: localCustomDoc.category || "",
          subtitle: localCustomDoc.subtitle || "",
          images: localCustomDoc.images?.length
            ? localCustomDoc.images
            : localCustomDoc.image
            ? [localCustomDoc.image]
            : [],
          material: localCustomDoc.material || "925 Silver",
          mrp: Number(localCustomDoc.mrp || 0),
          grams: Number(localCustomDoc.grams || 0),
          isActive: localCustomDoc.active !== false,
        };
      } else {
        source = catalogue.find(
          (item) => String(item._id) === erpProductId
        );

        if (!source) {
          return errorResponse(
            `ERP product not found: ${erpProductId}`,
            404
          );
        }

        sku = source.sku_id || `ERP-${source._id}`;

        erpBatchIds = new Set(
          (Array.isArray(source.batchids) ? source.batchids : [])
            .map((batch) => String(batch?.batchid || "").trim())
            .filter((id) => decodeBatchId(id))
        );
      }

      const preparedPieces = group.pieces.map((input) => {
        const batchId = String(input.batchId).trim();

        // For ERP products, enforce that batchId exists in ERP;
        // For custom AYO- products, any valid 14-digit batchId is allowed.
        if (!isCustomProduct && !erpBatchIds.has(batchId)) {
          throw new Error(
            `Invalid batch ${batchId} for ${source.name || sku}.`
          );
        }

        const batch = decodeBatchId(batchId);

        const acquisitionSilverRate = getRate(
          input.acquisitionSilverRate ?? input.silverRate,
          batch.sourceSilverRate,
          "Acquisition silver rate",
          batchId
        );

        const acquisitionLabourPerGram = getRate(
          input.acquisitionLabourPerGram ?? input.labourPerGram,
          batch.labourPerGram,
          "Acquisition labour rate",
          batchId
        );

        const weight = Number(input.weight);

        const silverCostPaise = Math.round(
          weight * acquisitionSilverRate * 100
        );

        const labourCostPaise = Math.round(
          weight * acquisitionLabourPerGram * 100
        );

        return {
          weight,
          batchId,
          acquisitionSilverRate,
          acquisitionLabourPerGram,
          silverCostPaise,
          labourCostPaise,
          allocatedExtraCostPaise: 0,
          acquisitionCostPaise: silverCostPaise + labourCostPaise,
        };
      });

      preparedGroups.push({
        erpProductId,
        sku,
        source,
        isCustomProduct,
        pieces: preparedPieces,
      });
    }

    // Calculate totals across ALL products.
    const allPieces = preparedGroups.flatMap(
      (group) => group.pieces
    );

    const totalWeight = allPieces.reduce(
      (sum, piece) => sum + piece.weight,
      0
    );

    const silverCostPaise = allPieces.reduce(
      (sum, piece) => sum + piece.silverCostPaise,
      0
    );

    const labourCostPaise = allPieces.reduce(
      (sum, piece) => sum + piece.labourCostPaise,
      0
    );

    // Allocate shared costs by weight across every piece.
    const totalExtraPaise =
      gstPaise + transportPaise + otherChargesPaise;

    let allocatedSoFar = 0;

    allPieces.forEach((piece, index) => {
      const allocatedExtraCostPaise =
        index === allPieces.length - 1
          ? totalExtraPaise - allocatedSoFar
          : Math.round(
              (totalExtraPaise * piece.weight) / totalWeight
            );

      allocatedSoFar += allocatedExtraCostPaise;

      piece.allocatedExtraCostPaise = allocatedExtraCostPaise;
      piece.acquisitionCostPaise =
        piece.silverCostPaise +
        piece.labourCostPaise +
        allocatedExtraCostPaise;
    });

    const totalCostPaise =
      silverCostPaise + labourCostPaise + totalExtraPaise;

    // Validate and prepare payment split.
    const rawPayments = Array.isArray(purchase.payments)
      ? purchase.payments
      : [];

    const payments = rawPayments
      .map((payment) => {
        const method = String(payment.method || "").trim();

        if (!PAYMENT_METHODS.includes(method)) {
          throw new Error(`Invalid payment method: ${method}`);
        }

        const amountPaise = moneyToPaise(
          payment.amount,
          "Payment amount"
        );

        return {
          method,
          account: getAccount(method),
          amountPaise,
        };
      })
      .filter((payment) => payment.amountPaise > 0);

    const amountPaidPaise = payments.reduce(
      (sum, payment) => sum + payment.amountPaise,
      0
    );

    if (amountPaidPaise > totalCostPaise) {
      return errorResponse(
        "Total payment cannot exceed purchase amount."
      );
    }

    const outstandingPaise = totalCostPaise - amountPaidPaise;
    const purchaseNumber = `PUR-${randomUUID()}`;

    session = await mongoose.startSession();

    let result;

    await session.withTransaction(async () => {
      const createdProductResults = [];
      const purchaseProducts = [];
      const ledgerEntries = [];

      for (const group of preparedGroups) {
        const { erpProductId, sku, source } = group;

        let product = await Product.findOne({
          $or: [{ erpProductId }, { sku }],
        }).session(session);

        if (
          product?.erpProductId &&
          String(product.erpProductId) !== erpProductId
        ) {
          throw new Error("Product identity conflict.");
        }

        if (product && product.sku !== sku) {
          throw new Error("Product SKU conflict.");
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

        // Sync catalogue information without replacing stock.
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
        product.lastSyncedAt = receivedAt;

        // Create physical pieces.
        const createdPieces = group.pieces.map((item) =>
          product.pieces.create({
            weight: item.weight,
            batchId: item.batchId,
            status: "inStock",
            receivedAt,
            acquisitionDate: purchaseDate,
            acquisitionSilverRate: item.acquisitionSilverRate,
            acquisitionLabourPerGram: item.acquisitionLabourPerGram,
            supplier: supplierName,
            purchaseReference: invoiceNumber || purchaseNumber,
            actualAcquisitionCost: paiseToRupees(
              item.acquisitionCostPaise
            ),
          })
        );

        product.pieces.push(...createdPieces);

        product.stockQuantity = product.pieces.filter(
          (piece) => piece.status === "inStock"
        ).length;

        await product.save({ session });

        const productSilverCost = group.pieces.reduce(
          (sum, item) => sum + item.silverCostPaise,
          0
        );

        const productLabourCost = group.pieces.reduce(
          (sum, item) => sum + item.labourCostPaise,
          0
        );

        const productExtraCost = group.pieces.reduce(
          (sum, item) => sum + item.allocatedExtraCostPaise,
          0
        );

        const productTotalCost =
          productSilverCost + productLabourCost + productExtraCost;

        const purchaseItems = createdPieces.map((piece, index) => {
          const item = group.pieces[index];

          return {
            pieceId: piece._id,
            weight: item.weight,
            batchId: item.batchId,
            silverRatePerGram: item.acquisitionSilverRate,
            labourPerGram: item.acquisitionLabourPerGram,
            silverCostPaise: item.silverCostPaise,
            labourCostPaise: item.labourCostPaise,
            allocatedExtraCostPaise: item.allocatedExtraCostPaise,
            acquisitionCostPaise: item.acquisitionCostPaise,
          };
        });

        purchaseProducts.push({
          productId: product._id,
          sku: product.sku,
          productName: product.name,
          items: purchaseItems,
          totalPieces: createdPieces.length,
          totalWeightGrams: group.pieces.reduce(
            (sum, item) => sum + item.weight,
            0
          ),
          silverCostPaise: productSilverCost,
          labourCostPaise: productLabourCost,
          totalCostPaise: productTotalCost,
        });

        createdPieces.forEach((piece) => {
          ledgerEntries.push({
            entryDate: purchaseDate,
            movementType: "stock_in",
            direction: "in",
            productId: product._id,
            pieceId: piece._id,
            sku: product.sku,
            productName: product.name,
            batchId: piece.batchId,
            weight: piece.weight,
            sourceSilverRate: piece.acquisitionSilverRate,
            labourPerGram: piece.acquisitionLabourPerGram,
            actualAcquisitionCost: piece.actualAcquisitionCost,
            reason: "Stock received",
            reference: invoiceNumber || purchaseNumber,
          });
        });

        createdProductResults.push({
          erpProductId,
          productId: String(product._id),
          name: product.name,
          sku: product.sku,
          stockQuantity: product.stockQuantity,
          addedPieces: createdPieces.map((piece) => ({
            pieceId: String(piece._id),
            weight: piece.weight,
            batchId: piece.batchId,
            acquisitionSilverRate: piece.acquisitionSilverRate,
            acquisitionLabourPerGram: piece.acquisitionLabourPerGram,
            actualAcquisitionCost: piece.actualAcquisitionCost,
          })),
        });
      }

      const [createdPurchase] = await OutletPurchase.create(
        [
          {
            purchaseNumber,
            purchaseDate,
            supplierName,
            supplierPhone,
            invoiceNumber,
            reference,
            products: purchaseProducts,
            totalProducts: purchaseProducts.length,
            totalPieces: allPieces.length,
            totalWeightGrams: totalWeight,
            averageSilverRatePerGram:
              totalWeight > 0 ? silverCostPaise / 100 / totalWeight : 0,
            averageLabourPerGram:
              totalWeight > 0 ? labourCostPaise / 100 / totalWeight : 0,
            silverCostPaise,
            labourCostPaise,
            gstPaise,
            transportPaise,
            otherChargesPaise,
            totalCostPaise,
            payments: payments.map((payment) => ({
              method: payment.method,
              account: payment.account,
              amountPaise: payment.amountPaise,
            })),
            amountPaidPaise,
            outstandingPaise,
            status: "received",
            notes,
          },
        ],
        { session }
      );

      if (!createdPurchase?._id) {
        throw new Error("Could not create purchase record.");
      }

      if (ledgerEntries.length > 0) {
        await JewelleryLedger.insertMany(ledgerEntries, { session });
      }

      if (payments.length > 0) {
        const transactions = payments.map((payment, index) => ({
          transactionDate: purchaseDate,
          type: "inventory_purchase",
          amount: paiseToRupees(payment.amountPaise),
          amountPaise: payment.amountPaise,
          idempotencyKey: `${purchaseNumber}-${index + 1}`,
          purchaseId: createdPurchase._id,
          category: "Stock Purchase",
          description: `Stock purchase ${purchaseNumber} - ${purchaseProducts.length} products`,
          person: "Supplier",
          paymentMethod: payment.method,
          account: payment.account,
          direction: "out",
          profitTreatment: "inventory",
          reference: invoiceNumber || purchaseNumber,
          createdBy: "admin",
        }));

        const createdTransactions = await OutletTransaction.insertMany(
          transactions,
          { session }
        );

        if (createdTransactions.length !== payments.length) {
          throw new Error(
            "Purchase payment transactions could not be linked."
          );
        }

        createdTransactions.forEach((transaction, index) => {
          createdPurchase.payments[index].transactionId = transaction._id;
        });

        await createdPurchase.save({ session });
      }

      result = {
        purchaseId: String(createdPurchase._id),
        purchaseNumber,
        products: createdProductResults,
        purchaseSummary: {
          totalProducts: purchaseProducts.length,
          totalPieces: allPieces.length,
          totalWeightGrams: Number(totalWeight.toFixed(3)),
          silverCost: paiseToRupees(silverCostPaise),
          labourCost: paiseToRupees(labourCostPaise),
          gst: paiseToRupees(gstPaise),
          transport: paiseToRupees(transportPaise),
          otherCharges: paiseToRupees(otherChargesPaise),
          totalCost: paiseToRupees(totalCostPaise),
          amountPaid: paiseToRupees(amountPaidPaise),
          outstanding: paiseToRupees(outstandingPaise),
        },
      };
    });

    return NextResponse.json({
      success: true,
      message: "Purchase and all product stocks recorded successfully.",
      ...result,
    });
  } catch (error) {
    console.error("Multi-product stock purchase error:", error);

    if (error.code === 11000) {
      return errorResponse(
        "Duplicate purchase, transaction or ledger entry detected.",
        409
      );
    }

    if (
      error.message === "Product identity conflict." ||
      error.message === "Product SKU conflict."
    ) {
      return errorResponse(error.message, 409);
    }

    return errorResponse(
      error.message || "Could not record purchase.",
      500
    );
  } finally {
    if (session) {
      await session.endSession();
    }
  }
}