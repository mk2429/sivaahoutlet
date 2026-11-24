import { NextResponse } from "next/server";
import mongoose from "mongoose";

import connectDB from "../../../../lib/db";
import Product from "../../../models/Product";
import Customer from "../../../models/Customer";
import Discount from "../../../models/Discount";
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

function roundSellingPrice(price) {
  if (!Number.isFinite(price) || price <= 0) return null;
  const hundred = Math.floor(price / 100) * 100;
  return price - hundred < 50 ? hundred - 1 : hundred + 99;
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

export async function POST(request) {
  let session;

  try {
    const body = await request.json();

    const {
      customerId = null,
      items = [],
      replacedItems: requestedReplacements = [],
      useWallet = false,
      discountId = null,
      paymentMethod = "Cash",
      paymentSummary = [],
      amountPaid,
      salespersonName = "",
    } = body;

    if (!Array.isArray(items) || items.length === 0) {
      return error("Select at least one new jewellery piece.");
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

    const db = mongoose.connection.db;

    const rateDoc = await db.collection("silverrates").findOne({
      metal: "silver",
    });

    const currentRate = Number(rateDoc?.ratePerGram);

    if (!Number.isFinite(currentRate) || currentRate <= 0) {
      return error("Please configure the current silver rate.");
    }

    const normalizedItems = [];
    const seenPieces = new Set();

    // 1. Validate new pieces being purchased
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
        return error(
          `${product.name}: this piece is no longer in stock.`,
          409
        );
      }

      const batch = decodeBatchId(piece.batchId);
      const weight = Number(piece.weight);

      if (!batch || !Number.isFinite(weight) || weight <= 0) {
        return error(`${product.name}: invalid piece weight or batch ID.`);
      }

      const pricing = calculatePiecePricing({
        weight,
        batch,
        currentSilverRate: currentRate,
      });

      if (pricing.cpToday == null || pricing.cpSource == null) {
        return error(`${product.name}: cost calculation failed.`);
      }

      const listPrice = roundSellingPrice(
        pricing.cpToday / ((1 - 0.15) * (1 - 0.25))
      );

      if (!listPrice) {
        return error("Could not calculate a selling price.");
      }

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
        calculatedSourceCost: piece.calculatedSourceCost ?? pricing.cpSource,
        replacementCostAtSale: pricing.cpToday,
        packagingCostAtSale: PACKAGING_COST,
        costAtSale: pricing.cpToday,
      });
    }

    // 2. Validate returned/replaced pieces (unworn items sold in last 7 days)
    const validatedReplacements = [];
    const seenReturnedPieces = new Set();
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    sevenDaysAgo.setHours(0, 0, 0, 0);

    if (
      Array.isArray(requestedReplacements) &&
      requestedReplacements.length > 0
    ) {
      for (const rep of requestedReplacements) {
        if (
          !mongoose.Types.ObjectId.isValid(rep.saleId) ||
          !mongoose.Types.ObjectId.isValid(rep.productId) ||
          !mongoose.Types.ObjectId.isValid(rep.pieceId)
        ) {
          return error("Invalid replacement item selected.");
        }

        const repKey = `${rep.saleId}:${rep.pieceId}`;
        if (seenReturnedPieces.has(repKey)) {
          return error("The same sold piece cannot be replaced twice.");
        }
        seenReturnedPieces.add(repKey);

        const oldSale = await Sale.findById(rep.saleId);
        if (!oldSale || oldSale.status !== "completed") {
          return error("Original invoice for replacement was not found.");
        }

        if (new Date(oldSale.createdAt) < sevenDaysAgo) {
          return error(
            `Invoice ${oldSale.billNumber} is older than 7 days and cannot be replaced.`
          );
        }

        const oldItem = oldSale.items.find(
          (it) =>
            String(it.productId) === String(rep.productId) &&
            String(it.pieceId) === String(rep.pieceId)
        );

        if (!oldItem) {
          return error("Sold piece not found on original invoice.");
        }

        if (oldItem.isReplaced) {
          return error(
            `${oldItem.name} (${oldSale.billNumber}) has already been replaced.`
          );
        }

        const itemsSum = oldSale.items.reduce(
          (sum, it) => sum + Number(it.finalPrice || 0),
          0
        );

        let creditAmount = Math.round(Number(oldItem.finalPrice || 0));
        if (
          itemsSum > 0 &&
          Math.abs(itemsSum - Number(oldSale.netAmount || 0)) >= 1
        ) {
          creditAmount = Math.round(
            (Number(oldItem.finalPrice || 0) / itemsSum) *
              Number(oldSale.netAmount || 0)
          );
        }

        const oldItemCost = Number(
          oldItem.costAtSale ??
            oldItem.replacementCostAtSale ??
            oldItem.actualAcquisitionCost ??
            0
        );

        const originalItemProfit =
          oldItem.profitAtSale != null
            ? Number(oldItem.profitAtSale)
            : round2(creditAmount - oldItemCost);

        validatedReplacements.push({
          originalSaleId: oldSale._id,
          originalBillNumber: oldSale.billNumber,
          productId: oldItem.productId,
          pieceId: oldItem.pieceId,
          name: oldItem.name,
          sku: oldItem.sku || "",
          batchId: oldItem.batchId || "",
          weight: Number(oldItem.weight || 0),
          actualAcquisitionCost: oldItem.actualAcquisitionCost ?? null,
          calculatedSourceCost: oldItem.calculatedSourceCost ?? null,
          creditAmount,
          originalItemProfit,
        });
      }
    }

    const replacementCredit = Math.round(
      validatedReplacements.reduce((sum, r) => sum + r.creditAmount, 0)
    );

    let customer = null;

    if (customerId) {
      if (!mongoose.Types.ObjectId.isValid(customerId)) {
        return error("Invalid customer.");
      }

      customer = await Customer.findById(customerId);

      if (!customer) {
        return error("Customer not found.", 404);
      }
    }

    if (replacementCredit > 0 && !customer) {
      return error(
        "Select or add a customer before processing a replacement."
      );
    }

    let discount = null;
    let discountAmount = 0;

    const grossAmount = round2(
      normalizedItems.reduce((sum, item) => sum + item.listPrice, 0)
    );

    const totalWeight = normalizedItems.reduce(
      (sum, item) => sum + item.weight,
      0
    );

    if (discountId) {
      if (!mongoose.Types.ObjectId.isValid(discountId)) {
        return error("Invalid discount.");
      }

      discount = await Discount.findById(discountId).lean();

      if (!discount || !discount.active) {
        return error("This discount is not active.");
      }

      const now = new Date();

      if (discount.startDate && new Date(discount.startDate) > now) {
        return error("This discount has not started yet.");
      }

      if (discount.endDate && new Date(discount.endDate) < now) {
        return error("This discount has expired.");
      }

      if (grossAmount < Number(discount.minBillAmount || 0)) {
        return error(`Minimum bill amount is ₹${discount.minBillAmount}.`);
      }

      if (totalWeight < Number(discount.minWeightGrams || 0)) {
        return error(`Minimum weight is ${discount.minWeightGrams}g.`);
      }

      const eligible = normalizedItems.filter((item) => {
        if (discount.applicability === "category") {
          return (discount.categories || []).includes(item.category);
        }

        if (discount.applicability === "sku") {
          return (discount.skus || []).includes(item.sku);
        }

        return true;
      });

      if (!eligible.length) {
        return error("No selected items qualify for this discount.");
      }

      for (const item of eligible) {
        const raw =
          discount.type === "percentage"
            ? (item.listPrice * Number(discount.value || 0)) / 100
            : Number(discount.value || 0);

        item.discountAmount = round2(Math.min(raw, item.listPrice * 0.15));

        item.finalPrice = round2(
          Math.max(0, item.listPrice - item.discountAmount)
        );

        discountAmount += item.discountAmount;
      }
    }

    discountAmount = round2(discountAmount);

    // New items invoice value
    const calculatedNetAmount = round2(grossAmount - discountAmount);
    const netAmount = Math.round(calculatedNetAmount);

    // Apply Replacement Credit & Wallet Balance
    const afterReplacement = netAmount - replacementCredit;
    const walletCredited =
      afterReplacement < 0 ? Math.abs(afterReplacement) : 0;

    const availableWallet = customer
      ? Math.max(0, Math.round(Number(customer.walletBalance || 0)))
      : 0;

    const walletUsed =
      useWallet && afterReplacement > 0
        ? Math.min(availableWallet, afterReplacement)
        : 0;

    const payableAfterAdjustments = Math.max(
      0,
      afterReplacement - walletUsed
    );

    const taxRate = Number(process.env.GST_RATE || 3);

    if (!Number.isFinite(taxRate) || taxRate < 0 || taxRate > 100) {
      return error("Invalid GST rate configuration.", 500);
    }

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
        ? payableAfterAdjustments
        : Number(amountPaid);

    if (
      !Number.isFinite(paid) ||
      paid < 0 ||
      paid > payableAfterAdjustments ||
      !Number.isInteger(paid)
    ) {
      return error(
        `Amount received must be a whole rupee between ₹0 and ₹${payableAfterAdjustments}.`
      );
    }

    const validPaymentSummary = Array.isArray(paymentSummary)
      ? paymentSummary
      : [];

    const paymentTotal = validPaymentSummary.reduce(
      (sum, line) => sum + Number(line.amount || 0),
      0
    );

    if (
      validPaymentSummary.length &&
      (validPaymentSummary.some(
        (line) =>
          !allowedMethods.includes(line.method) ||
          !Number.isFinite(Number(line.amount)) ||
          Number(line.amount) < 0
      ) ||
        Math.abs(round2(paymentTotal) - paid) > 0.001)
    ) {
      return error("Payment breakdown must equal the amount received.");
    }

    for (const item of normalizedItems) {
      item.profitAtSale = round2(item.finalPrice - item.costAtSale);
    }

    const totalCostAtSale = round2(
      normalizedItems.reduce((sum, item) => sum + item.costAtSale, 0)
    );

    // Subtract original profit of returned item(s) so overall profit across bills is exact
    const returnedProfitReversed = round2(
      validatedReplacements.reduce(
        (sum, r) => sum + (Number(r.originalItemProfit) || 0),
        0
      )
    );

    const profitAtSale = round2(
      netAmount - totalCostAtSale - returnedProfitReversed
    );

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
      discountAmount: item.discountAmount,
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
      // A. Mark new pieces as sold
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
            (piece) => piece.status === "inStock"
          ).length;
          await product.save({ session });
        }
      }

      // B. Put returned/replaced pieces directly back into inStock
      for (const rep of validatedReplacements) {
        const restockUpdate = await Product.updateOne(
          {
            _id: rep.productId,
            pieces: {
              $elemMatch: {
                _id: rep.pieceId,
                status: "sold",
              },
            },
          },
          { $set: { "pieces.$.status": "inStock" } },
          { session }
        );

        if (restockUpdate.modifiedCount !== 1) {
          throw new Error(
            `Returned piece ${rep.name} is not marked as sold in inventory.`
          );
        }

        const returnedProduct = await Product.findById(rep.productId).session(
          session
        );
        if (returnedProduct) {
          returnedProduct.stockQuantity = returnedProduct.pieces.filter(
            (piece) => piece.status === "inStock"
          ).length;
          await returnedProduct.save({ session });
        }
      }

      // C. Create the new Sale record
      const [sale] = await Sale.create(
        [
          {
            billNumber,
            silverRateAtSale: currentRate,
            customerId: customer?._id || null,
            customerSnapshot: {
              name: customer?.name || "Walk-in Customer",
              whatsappNumber: customer?.whatsappNumber || "",
              address: customer?.address || "",
              gstin: customer?.gstin || "",
            },
            items: saleItems,
            replacedItems: validatedReplacements.map((r) => ({
              originalSaleId: r.originalSaleId,
              originalBillNumber: r.originalBillNumber,
              productId: r.productId,
              pieceId: r.pieceId,
              name: r.name,
              sku: r.sku,
              batchId: r.batchId,
              weight: r.weight,
              creditAmount: r.creditAmount,
            })),
            replacementCredit,
            walletUsed,
            walletCredited,
            discount: discount
              ? {
                  discountId: discount._id,
                  name: discount.name || "",
                  type: discount.type || "",
                  value: Number(discount.value || 0),
                }
              : undefined,
            grossAmount,
            discountAmount,
            netAmount,
            totalCostAtSale,
            returnedProfitReversed,
            profitAtSale,
            taxSnapshot,
            amountPaid: paid,
            balance: round2(payableAfterAdjustments - paid),
            paymentMethod,
            paymentSummary: validPaymentSummary,
            salespersonName: String(salespersonName || ""),
            status: "completed",
          },
        ],
        { session }
      );

      // D. Lock replaced items on their original invoices & original customer's bill snapshot
      for (const rep of validatedReplacements) {
        const oldSaleDoc = await Sale.findById(rep.originalSaleId).session(
          session
        );
        if (oldSaleDoc) {
          const targetItem = oldSaleDoc.items.find(
            (it) =>
              String(it.productId) === String(rep.productId) &&
              String(it.pieceId) === String(rep.pieceId)
          );
          if (targetItem) {
            if (targetItem.isReplaced) {
              throw new Error(
                `${targetItem.name} was already replaced in another bill.`
              );
            }
            targetItem.isReplaced = true;
            targetItem.replacedAt = sale.createdAt || new Date();
            targetItem.replacedInSaleId = sale._id;
            targetItem.replacedInBillNumber = billNumber;
            await oldSaleDoc.save({ session });
          }

          if (oldSaleDoc.customerId) {
            await Customer.updateOne(
              {
                _id: oldSaleDoc.customerId,
                "bills.saleId": oldSaleDoc._id,
              },
              {
                $set: {
                  "bills.$[b].items.$[i].isReplaced": true,
                },
              },
              {
                arrayFilters: [
                  { "b.saleId": oldSaleDoc._id },
                  { "i.pieceId": rep.pieceId },
                ],
                session,
              }
            );
          }
        }
      }

      // E. Save Bill Snapshot on Customer & Update Wallet
      if (customer) {
        const custDoc = await Customer.findById(customer._id).session(session);
        if (custDoc) {
          let runningBalance = Math.max(
            0,
            Math.round(Number(custDoc.walletBalance || 0))
          );

          if (walletUsed > 0) {
            if (runningBalance < walletUsed) {
              throw new Error("Insufficient customer wallet balance.");
            }
            runningBalance -= walletUsed;
            custDoc.walletTransactions.push({
              type: "debit",
              amount: walletUsed,
              balanceAfter: runningBalance,
              reason: `Redeemed on bill ${billNumber}`,
              saleId: sale._id,
              billNumber,
            });
          }

          if (walletCredited > 0) {
            runningBalance += walletCredited;
            custDoc.walletTransactions.push({
              type: "credit",
              amount: walletCredited,
              balanceAfter: runningBalance,
              reason: `Surplus exchange credit on bill ${billNumber}`,
              saleId: sale._id,
              billNumber,
            });
          }

          custDoc.walletBalance = runningBalance;

          custDoc.bills.unshift({
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
            discountAmount,
            netAmount,
            replacementCredit,
            walletUsed,
            walletCredited,
            amountPaid: paid,
            paymentMethod,
          });

          await custDoc.save({ session });
        }
      }

      // F. Write JewelleryLedger entries (stock_out for new pieces, stock_in for returned pieces)
      const ledgerEntries = [
        ...normalizedItems.map((item) => ({
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
          sourceSilverRate: currentRate,
          labourPerGram: item.batch.labourPerGram,
          actualAcquisitionCost: item.actualAcquisitionCost,
          calculatedSourceCost: item.calculatedSourceCost,
          reason: "Jewellery sold",
          reference: billNumber,
        })),
        ...validatedReplacements.map((rep) => {
          const decoded = decodeBatchId(rep.batchId);
          return {
            entryDate: sale.createdAt || new Date(),
            movementType: "stock_in",
            direction: "in",
            productId: rep.productId,
            pieceId: rep.pieceId,
            saleId: sale._id,
            billNumber,
            sku: rep.sku,
            productName: rep.name,
            batchId: rep.batchId,
            weight: rep.weight,
            sourceSilverRate: decoded?.sourceSilverRate || currentRate,
            labourPerGram: decoded?.labourPerGram || 0,
            actualAcquisitionCost: rep.actualAcquisitionCost,
            calculatedSourceCost: rep.calculatedSourceCost,
            reason: `Customer exchange return (from ${rep.originalBillNumber})`,
            reference: billNumber,
          };
        }),
      ];

      await JewelleryLedger.insertMany(ledgerEntries, { session });

      savedSale = sale;
    });

    return NextResponse.json(
      { success: true, sale: savedSale },
      { status: 201 }
    );
  } catch (e) {
    console.error("Sale save error:", e);
    return error(e.message || "Unable to save sale.", 500);
  } finally {
    if (session) await session.endSession();
  }
}