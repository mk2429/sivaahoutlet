import { NextResponse } from "next/server";
import mongoose from "mongoose";

import connectDB from "../../../../lib/db";
import Product from "../../../models/Product";
import Customer from "../../../models/Customer";
import Sale from "../../../models/Sale";
import InvoiceCounter from "../../../models/InvoiceCounter";
import JewelleryLedger from "../../../models/JewelleryLedger";

import {
  PACKAGING_COST,
  decodeBatchId,
  calculatePiecePricing,
} from "@/lib/pricing";

function error(message, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

function round2(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

async function generateInvoiceNumber() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date());

  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  const startYear = month >= 4 ? year : year - 1;
  const financialYear = `${startYear}-${String(startYear + 1).slice(-2)}`;

  const counter = await InvoiceCounter.findOneAndUpdate(
    { financialYear },
    { $inc: { lastNumber: 1 } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  return `SV/${financialYear}/${String(counter.lastNumber).padStart(6, "0")}`;
}

export async function GET() {
  try {
    await connectDB();

    const products = await Product.find({
      active: { $ne: false },
      "pieces.status": "inStock",
    })
      .select("name sku category pieces")
      .lean();

    const inStockPieces = [];

    for (const prod of products) {
      if (!Array.isArray(prod.pieces)) continue;
      for (const piece of prod.pieces) {
        if (piece.status === "inStock") {
          inStockPieces.push({
            productId: String(prod._id),
            pieceId: String(piece._id),
            name: prod.name || "925 Silver Jewellery",
            sku: prod.sku || "",
            category: prod.category || "",
            batchId: piece.batchId || "",
            weight: Number(piece.weight) || 0,
          });
        }
      }
    }

    return NextResponse.json({ pieces: inStockPieces }, { status: 200 });
  } catch (e) {
    console.error("Wholesale pieces fetch error:", e);
    return error(e.message || "Failed to load in-stock pieces.", 500);
  }
}

export async function POST(request) {
  let session;

  try {
    const body = await request.json();

    const {
      wholesaleSilverRate,
      items = [],
      paymentMethod = "Cash",
      paymentSummary = [],
      amountPaid,
      salespersonName = "Wholesale",
    } = body;

    if (!Array.isArray(items) || items.length === 0) {
      return error("Select at least one jewellery piece.");
    }

    const activeSilverRate = Number(wholesaleSilverRate);
    if (!Number.isFinite(activeSilverRate) || activeSilverRate <= 0) {
      return error("Please enter a valid silver rate for this bill.");
    }

    const allowedMethods = [
      "Cash",
      "UPI",
      "Card",
      "Bank Transfer",
      "Other",
      "Split",
    ];
    if (!allowedMethods.includes(paymentMethod)) {
      return error("Invalid payment method.");
    }

    await connectDB();

    const normalizedItems = [];
    const seenPieces = new Set();

    // 1. Validate pieces & calculate wholesale selling price + cost (with PACKAGING_COST) + exact profit
    for (const requested of items) {
      if (
        !mongoose.Types.ObjectId.isValid(requested.productId) ||
        !mongoose.Types.ObjectId.isValid(requested.pieceId)
      ) {
        return error("Invalid product or piece selected.");
      }

      const uniqueKey = `${requested.productId}:${requested.pieceId}`;
      if (seenPieces.has(uniqueKey)) {
        return error("A jewellery piece cannot be added twice.");
      }
      seenPieces.add(uniqueKey);

      const product = await Product.findById(requested.productId);
      if (!product || product.active === false) {
        return error("A selected product is unavailable.");
      }

      const piece = product.pieces.id(requested.pieceId);
      if (!piece || piece.status !== "inStock") {
        return error(`${product.name}: this piece is no longer in stock.`, 409);
      }

      const batch = decodeBatchId(piece.batchId);
      const weight = Number(piece.weight);

      if (!batch || !Number.isFinite(weight) || weight <= 0) {
        return error(`${product.name}: invalid piece weight or batch ID.`);
      }

      const customMakingPerGm = Number(requested.makingPerGm);
      if (!Number.isFinite(customMakingPerGm) || customMakingPerGm < 0) {
        return error(`${product.name}: enter a valid making/gm.`);
      }

      // Used to preserve calculatedSourceCost snapshot
      const pricing = calculatePiecePricing({
        weight,
        batch,
        currentSilverRate: activeSilverRate,
      });

      // Wholesale Cost = (Weight * Bill Silver Rate) + (Weight * Batch Cost Labour/gm) + Packaging (₹50)
      const wholesaleCostAtSale = round2(
        weight * activeSilverRate + weight * batch.labourPerGram + PACKAGING_COST
      );

      // Wholesale Selling Price = (Weight * Bill Silver Rate) + (Weight * Custom Making/gm)
      const listPrice = round2(
        weight * activeSilverRate + weight * customMakingPerGm
      );

      normalizedItems.push({
        productId: product._id,
        pieceId: piece._id,
        productName: product.name,
        sku: product.sku || "",
        category: product.category || "",
        batchId: piece.batchId,
        weight,
        batch,
        listPrice,
        discountAmount: 0,
        finalPrice: listPrice,
        actualAcquisitionCost: piece.actualAcquisitionCost ?? null,
        calculatedSourceCost:
          piece.calculatedSourceCost ?? pricing?.cpSource ?? wholesaleCostAtSale,
        replacementCostAtSale: wholesaleCostAtSale,
        packagingCostAtSale: PACKAGING_COST,
        costAtSale: wholesaleCostAtSale,
        profitAtSale: round2(listPrice - wholesaleCostAtSale),
      });
    }

    // 2. Find or auto-create the single "Wholesale" Customer document
    let customer = await Customer.findOne({ name: /^wholesale$/i });
    if (!customer) {
      customer = await Customer.create({
        name: "Wholesale",
        whatsappNumber: "",
        gender: "Other",
        address: "",
        walletBalance: 0,
        walletTransactions: [],
        bills: [],
      });
    }

    const grossAmount = round2(
      normalizedItems.reduce((sum, item) => sum + item.listPrice, 0)
    );
    const totalWeight = normalizedItems.reduce(
      (sum, item) => sum + item.weight,
      0
    );
    const netAmount = Math.round(grossAmount);

    const taxRate = Number(process.env.GST_RATE || 3);
    const taxableValue = round2(netAmount / (1 + taxRate / 100));
    const totalTax = round2(netAmount - taxableValue);
    const cgst = round2(totalTax / 2);
    const sgst = round2(totalTax - cgst);

    const taxSnapshot = {
      rate: taxRate,
      taxableValue,
      cgst,
      sgst,
      igst: 0,
      totalTax,
      inclusive: true,
      placeOfSupplyStateCode: "09",
    };

    const paid =
      amountPaid === undefined || amountPaid === ""
        ? netAmount
        : Number(amountPaid);

    if (
      !Number.isFinite(paid) ||
      paid < 0 ||
      paid > netAmount ||
      !Number.isInteger(paid)
    ) {
      return error(
        `Amount received must be a whole rupee between ₹0 and ₹${netAmount}.`
      );
    }

    const totalCostAtSale = round2(
      normalizedItems.reduce((sum, item) => sum + item.costAtSale, 0)
    );
    const profitAtSale = round2(netAmount - totalCostAtSale);
    const billNumber = await generateInvoiceNumber();

    const saleItems = normalizedItems.map((item) => ({
      productId: item.productId,
      pieceId: item.pieceId,
      name: item.productName,
      sku: item.sku,
      category: item.category,
      batchId: item.batchId,
      hsnCode: "7113",
      weight: item.weight,
      listPrice: item.listPrice,
      discountAmount: 0,
      finalPrice: item.finalPrice,
      actualAcquisitionCost: item.actualAcquisitionCost,
      calculatedSourceCost: item.calculatedSourceCost,
      replacementCostAtSale: item.replacementCostAtSale,
      packagingCostAtSale: item.packagingCostAtSale,
      costAtSale: item.costAtSale,
      profitAtSale: item.profitAtSale,
    }));

    session = await mongoose.startSession();
    let savedSale;

    await session.withTransaction(async () => {
      // A. Mark pieces as sold & update stockQuantity
      for (const item of normalizedItems) {
        const update = await Product.updateOne(
          {
            _id: item.productId,
            pieces: {
              $elemMatch: {
                _id: item.pieceId,
                status: "inStock",
              },
            },
          },
          { $set: { "pieces.$.status": "sold" } },
          { session }
        );

        if (update.modifiedCount !== 1) {
          throw new Error(
            `${item.productName}: stock changed. Reload and try again.`
          );
        }

        const product = await Product.findById(item.productId).session(session);
        if (product) {
          product.stockQuantity = product.pieces.filter(
            (p) => p.status === "inStock"
          ).length;
          await product.save({ session });
        }
      }

      // B. Create the Sale record
      const [sale] = await Sale.create(
        [
          {
            billNumber,
            silverRateAtSale: activeSilverRate,
            customerId: customer._id,
            customerSnapshot: {
              name: customer.name,
              whatsappNumber: customer.whatsappNumber || "",
              address: customer.address || "",
              gstin: customer.gstin || "",
            },
            items: saleItems,
            replacedItems: [],
            replacementCredit: 0,
            walletUsed: 0,
            walletCredited: 0,
            grossAmount,
            discountAmount: 0,
            netAmount,
            totalCostAtSale,
            returnedProfitReversed: 0,
            profitAtSale,
            taxSnapshot,
            amountPaid: paid,
            balance: round2(netAmount - paid),
            paymentMethod,
            paymentSummary: Array.isArray(paymentSummary) ? paymentSummary : [],
            salespersonName: String(salespersonName || "Wholesale"),
            status: "completed",
          },
        ],
        { session }
      );

      // C. Push bill into the "Wholesale" customer's bills array
      await Customer.updateOne(
        { _id: customer._id },
        {
          $push: {
            bills: {
              $each: [
                {
                  saleId: sale._id,
                  billNumber,
                  billDate: sale.createdAt || new Date(),
                  items: saleItems.map((it) => ({
                    productId: it.productId,
                    pieceId: it.pieceId,
                    name: it.name,
                    sku: it.sku,
                    weight: it.weight,
                    finalPrice: it.finalPrice,
                    isReplaced: false,
                  })),
                  totalWeight: round2(totalWeight),
                  grossAmount,
                  discountAmount: 0,
                  netAmount,
                  replacementCredit: 0,
                  walletUsed: 0,
                  walletCredited: 0,
                  amountPaid: paid,
                  paymentMethod,
                },
              ],
              $position: 0,
            },
          },
        },
        { session }
      );

      // D. Write JewelleryLedger entries
      const ledgerEntries = normalizedItems.map((item) => ({
        entryDate: sale.createdAt || new Date(),
        movementType: "sale",
        direction: "out",
        productId: item.productId,
        pieceId: item.pieceId,
        saleId: sale._id,
        billNumber,
        sku: item.sku,
        productName: item.productName,
        batchId: item.batchId,
        weight: item.weight,
        sourceSilverRate: activeSilverRate,
        labourPerGram: item.batch.labourPerGram,
        actualAcquisitionCost: item.actualAcquisitionCost,
        calculatedSourceCost: item.calculatedSourceCost,
        reason: "Wholesale jewellery sold",
        reference: billNumber,
      }));

      await JewelleryLedger.insertMany(ledgerEntries, { session });

      savedSale = sale;
    });

    return NextResponse.json(
      { success: true, sale: savedSale },
      { status: 201 }
    );
  } catch (e) {
    console.error("Wholesale sale save error:", e);
    return error(e.message || "Unable to save wholesale sale.", 500);
  } finally {
    if (session) await session.endSession();
  }
}