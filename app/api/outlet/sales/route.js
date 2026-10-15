
import { NextResponse } from "next/server";
import mongoose from "mongoose";

import connectDB from "../../../../lib/db";

import Product from "../../../models/Product";
import Customer from "../../../models/Customer";
import Discount from "../../../models/Discount";
import Sale from "../../../models/Sale";
import InvoiceCounter from "../../../models/InvoiceCounter";

function roundSellingPrice(price) {
  if (!Number.isFinite(price) || price <= 0) return null;

  const hundred = Math.floor(price / 100) * 100;

  return price - hundred < 50 ? hundred - 1 : hundred + 99;
}

function decodeBatch(batchId) {
  const id = String(batchId || "");

  if (!/^\d{14}$/.test(id)) return null;

  return {
    sourceRate: Number(id.slice(8, 11)),
    labourPerGram: Number(id.slice(11, 14)),
  };
}

async function generateInvoiceNumber() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date());

  const year = Number(
    parts.find((part) => part.type === "year")?.value
  );

  const month = Number(
    parts.find((part) => part.type === "month")?.value
  );

  const startYear = month >= 4 ? year : year - 1;

  const financialYear =
    `${startYear}-${String(startYear + 1).slice(-2)}`;

  const counter = await InvoiceCounter.findOneAndUpdate(
    { financialYear },
    { $inc: { lastNumber: 1 } },
    {
      new: true,
      upsert: true,
      setDefaultsOnInsert: true,
    }
  );

  return `SV/${financialYear}/${String(counter.lastNumber).padStart(6, "0")}`;
}

export async function POST(request) {
  const soldPieces = [];

  try {
    const body = await request.json();

    const {
      customerId = null,
      items = [],
      discountId = null,
      paymentMethod = "Cash",
      paymentSummary = [],
      amountPaid,
      salespersonName = "",
    } = body;

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { error: "Select at least one jewellery piece." },
        { status: 400 }
      );
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
      return NextResponse.json(
        { error: "Invalid payment method." },
        { status: 400 }
      );
    }

    await connectDB();

    let customer = null;

    if (customerId) {
      if (!mongoose.Types.ObjectId.isValid(customerId)) {
        return NextResponse.json(
          { error: "Invalid customer." },
          { status: 400 }
        );
      }

      customer = await Customer.findById(customerId).lean();

      if (!customer) {
        return NextResponse.json(
          { error: "Customer not found." },
          { status: 404 }
        );
      }
    }

    const rateDoc = await mongoose.connection.db
      .collection("silverrates")
      .findOne({ metal: "silver" });

    const currentRate = Number(rateDoc?.ratePerGram);

    if (!Number.isFinite(currentRate) || currentRate <= 0) {
      return NextResponse.json(
        { error: "Please configure the current silver rate." },
        { status: 400 }
      );
    }

    const normalizedItems = [];
    const seenPieces = new Set();

    for (const requested of items) {
      if (
        !mongoose.Types.ObjectId.isValid(requested.productId) ||
        !mongoose.Types.ObjectId.isValid(requested.pieceId)
      ) {
        return NextResponse.json(
          { error: "Invalid product or piece selected." },
          { status: 400 }
        );
      }

      const uniqueKey = `${requested.productId}:${requested.pieceId}`;

      if (seenPieces.has(uniqueKey)) {
        return NextResponse.json(
          { error: "A jewellery piece cannot be added twice." },
          { status: 400 }
        );
      }

      seenPieces.add(uniqueKey);

      const product = await Product.findById(requested.productId);

      if (!product || product.active === false) {
        return NextResponse.json(
          { error: "A selected product is unavailable." },
          { status: 400 }
        );
      }

      const piece = product.pieces.id(requested.pieceId);

      if (!piece || piece.status !== "inStock") {
        return NextResponse.json(
          {
            error: `${product.name}: this piece is no longer in stock.`,
          },
          { status: 409 }
        );
      }

      const batch = decodeBatch(piece.batchId);

      if (!batch) {
        return NextResponse.json(
          {
            error: `${product.name}: invalid batch ID ${piece.batchId || "(missing)"}.`,
          },
          { status: 400 }
        );
      }

      const weight = Number(piece.weight);

      if (!Number.isFinite(weight) || weight <= 0) {
        return NextResponse.json(
          { error: `${product.name}: invalid piece weight.` },
          { status: 400 }
        );
      }

      const costToday =
        weight * (currentRate + batch.labourPerGram) + 50;

      const listPrice = roundSellingPrice(
        costToday / ((1 - 0.15) * (1 - 0.25))
      );

      if (!listPrice) {
        return NextResponse.json(
          { error: "Could not calculate a selling price." },
          { status: 400 }
        );
      }

      normalizedItems.push({
        product,
        piece,
        item: {
          productId: product._id,
          pieceId: piece._id,
          name: product.name,
          sku: product.sku || "",
          category: product.category || "",
          batchId: piece.batchId,
          hsnCode: "7113",
          weight,
          listPrice,
          discountAmount: 0,
          finalPrice: listPrice,
        },
      });
    }

    const grossAmount = normalizedItems.reduce(
      (sum, row) => sum + row.item.listPrice,
      0
    );

    const totalWeight = normalizedItems.reduce(
      (sum, row) => sum + row.item.weight,
      0
    );

    let discount = null;
    let discountAmount = 0;

    if (discountId) {
      if (!mongoose.Types.ObjectId.isValid(discountId)) {
        return NextResponse.json(
          { error: "Invalid discount." },
          { status: 400 }
        );
      }

      discount = await Discount.findById(discountId).lean();

      if (!discount || !discount.active) {
        return NextResponse.json(
          { error: "This discount is not active." },
          { status: 400 }
        );
      }

      const now = new Date();

      if (discount.startDate && new Date(discount.startDate) > now) {
        return NextResponse.json(
          { error: "This discount has not started yet." },
          { status: 400 }
        );
      }

      if (discount.endDate && new Date(discount.endDate) < now) {
        return NextResponse.json(
          { error: "This discount has expired." },
          { status: 400 }
        );
      }

      if (grossAmount < Number(discount.minBillAmount || 0)) {
        return NextResponse.json(
          { error: `Minimum bill amount is ₹${discount.minBillAmount}.` },
          { status: 400 }
        );
      }

      if (totalWeight < Number(discount.minWeightGrams || 0)) {
        return NextResponse.json(
          { error: `Minimum weight is ${discount.minWeightGrams}g.` },
          { status: 400 }
        );
      }

      const eligibleRows = normalizedItems.filter(({ item }) => {
        if (discount.applicability === "category") {
          return (discount.categories || []).includes(item.category);
        }

        if (discount.applicability === "sku") {
          return (discount.skus || []).includes(item.sku);
        }

        return true;
      });

      if (eligibleRows.length === 0) {
        return NextResponse.json(
          { error: "No selected items qualify for this discount." },
          { status: 400 }
        );
      }

      for (const row of eligibleRows) {
        const rawDiscount =
          discount.type === "percentage"
            ? (row.item.listPrice * Number(discount.value || 0)) / 100
            : Number(discount.value || 0);

        // Maximum discount allowed: 15% per item.
        const applied = Math.min(
          rawDiscount,
          row.item.listPrice * 0.15
        );

        row.item.discountAmount =
          Math.round(applied * 100) / 100;

        row.item.finalPrice = Math.max(
          0,
          row.item.listPrice - row.item.discountAmount
        );

        discountAmount += row.item.discountAmount;
      }
    }

    discountAmount = Math.round(discountAmount * 100) / 100;

    const netAmount =
      Math.round((grossAmount - discountAmount) * 100) / 100;

    // Assumes GST-inclusive pricing and an intra-state sale.
    // Confirm tax treatment and HSN classification with your CA.
    const taxRate = Number(process.env.GST_RATE || 3);

    if (!Number.isFinite(taxRate) || taxRate < 0 || taxRate > 100) {
      return NextResponse.json(
        { error: "Invalid GST rate configuration." },
        { status: 500 }
      );
    }

    const taxableValue =
      Math.round((netAmount / (1 + taxRate / 100)) * 100) / 100;

    const totalTax =
      Math.round((netAmount - taxableValue) * 100) / 100;

    const cgst = Math.round((totalTax / 2) * 100) / 100;
    const sgst = Math.round((totalTax - cgst) * 100) / 100;

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
      paid > netAmount
    ) {
      return NextResponse.json(
        {
          error: "Amount received must be between ₹0 and the bill total.",
        },
        { status: 400 }
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
      validPaymentSummary.length > 0 &&
      (
        validPaymentSummary.some(
          (line) =>
            !allowedMethods.includes(line.method) ||
            !Number.isFinite(Number(line.amount)) ||
            Number(line.amount) < 0
        ) ||
        Math.abs(paymentTotal - paid) > 0.02
      )
    ) {
      return NextResponse.json(
        {
          error: "Payment breakdown must equal the amount received.",
        },
        { status: 400 }
      );
    }

    const billNumber = await generateInvoiceNumber();

    // Conditionally mark each piece sold to prevent duplicate sales.
    for (const row of normalizedItems) {
      const update = await Product.updateOne(
        {
          _id: row.product._id,
          pieces: {
            $elemMatch: {
              _id: row.piece._id,
              status: "inStock",
            },
          },
        },
        {
          $set: { "pieces.$.status": "sold" },
        }
      );

      if (update.modifiedCount !== 1) {
        throw new Error(
          `${row.product.name}: stock changed. Please reload and try again.`
        );
      }

      soldPieces.push({
        productId: row.product._id,
        pieceId: row.piece._id,
      });
    }

    const sale = await Sale.create({
      billNumber,

      customerId: customer?._id || null,

      customerSnapshot: {
        name: customer?.name || "Walk-in Customer",
        whatsappNumber: customer?.whatsappNumber || "",
        address: customer?.address || "",
        gstin: customer?.gstin || "",
      },

      items: normalizedItems.map((row) => row.item),

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
      taxSnapshot,

      amountPaid: paid,
      balance: Math.round((netAmount - paid) * 100) / 100,

      paymentMethod,
      paymentSummary: validPaymentSummary,

      salespersonName: String(salespersonName || ""),
      status: "completed",
    });

    return NextResponse.json(
      { success: true, sale },
      { status: 201 }
    );
  } catch (error) {
    console.error("Sale save error:", error);

    // Best-effort rollback if an error occurred after stock was marked sold.
    for (const piece of soldPieces.reverse()) {
      try {
        await Product.updateOne(
          {
            _id: piece.productId,
            pieces: {
              $elemMatch: {
                _id: piece.pieceId,
                status: "sold",
              },
            },
          },
          {
            $set: { "pieces.$.status": "inStock" },
          }
        );
      } catch (rollbackError) {
        console.error("Stock rollback error:", rollbackError);
      }
    }

    return NextResponse.json(
      { error: error.message || "Unable to save sale." },
      { status: 500 }
    );
  }
}
