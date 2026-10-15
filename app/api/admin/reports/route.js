
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import mongoose from "mongoose";

import connectDB from "../../../../lib/db";
import { verifyAdminToken } from "../../../../lib/admin-auth";

import Sale from "../../../models/Sale";
import Product from "../../../models/Product";

import {
  decodeBatchId,
  calculatePiecePricing,
} from "@/lib/pricing";



const PACKAGING_COST = 50;

function isAdminTokenValid(token) {
  if (!token) return false;

  try {
    return verifyAdminToken(token);
  } catch {
    return false;
  }
}

function round2(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function money(value) {
  return round2(value);
}

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

// Interpret date filters in Indian Standard Time.
function startOfIndiaDay(dateString) {
  return new Date(`${dateString}T00:00:00.000+05:30`);
}

function endOfIndiaDay(dateString) {
  return new Date(`${dateString}T23:59:59.999+05:30`);
}

function getIndiaDateKey(date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(date));
}

function getIndiaMonthKey(date) {
  return getIndiaDateKey(date).slice(0, 7);
}

function getItemPricing(item, silverRateAtSale) {
  const weight = toNumber(item.weight);
  const sellingPrice = money(item.finalPrice);
  const batch = decodeBatchId(item.batchId);

  if (!batch || weight <= 0) {
    return {
      weight,
      sellingPrice,
      batchDate: null,
      sourceSilverRate: null,
      labourPerGram: null,
      cpInstant: null,
      cpSource: null,
      profitInstant: null,
      profitSource: null,
      pricingStatus: "Invalid weight or batch ID",
    };
  }

  const instantRate = toNumber(silverRateAtSale);

  if (instantRate <= 0) {
    return {
      weight,
      sellingPrice,
      batchDate: batch.batchDate,
      sourceSilverRate: batch.sourceSilverRate,
      labourPerGram: batch.labourPerGram,
      cpInstant: null,
      cpSource: null,
      profitInstant: null,
      profitSource: null,
      pricingStatus: "Invalid silver rate at sale",
    };
  }

  // Use the shared pricing helper for both cost calculations.
  const instantPricing = calculatePiecePricing({
    weight,
    batch,
    currentSilverRate: instantRate,
  });

  // cpSource uses the batch's source silver rate.
  const sourcePricing = calculatePiecePricing({
    weight,
    batch,
    currentSilverRate: batch.sourceSilverRate,
  });

  const cpInstant = instantPricing.cpToday;
  const cpSource = sourcePricing.cpSource;

  if (cpInstant == null || cpSource == null) {
    return {
      weight,
      sellingPrice,
      batchDate: batch.batchDate,
      sourceSilverRate: batch.sourceSilverRate,
      labourPerGram: batch.labourPerGram,
      cpInstant: null,
      cpSource: null,
      profitInstant: null,
      profitSource: null,
      pricingStatus: "Cost calculation failed",
    };
  }

  return {
    weight,
    sellingPrice,
    batchDate: batch.batchDate,
    sourceSilverRate: batch.sourceSilverRate,
    labourPerGram: batch.labourPerGram,
    cpInstant: money(cpInstant),
    cpSource: money(cpSource),
    profitInstant: money(sellingPrice - cpInstant),
    profitSource: money(sellingPrice - cpSource),
    pricingStatus: "Ready",
  };
}

function emptyTotals() {
  return {
    bills: 0,
    piecesSold: 0,
    totalWeight: 0,
    grossSales: 0,
    discounts: 0,
    netSales: 0,
    amountPaid: 0,
    balance: 0,
    profitInstant: 0,
    profitSource: 0,
    profitInstantItems: 0,
    profitSourceItems: 0,
  };
}

function addBillToTotals(totals, bill) {
  totals.bills += 1;
  totals.grossSales += toNumber(bill.grossAmount);
  totals.discounts += toNumber(bill.discountAmount);
  totals.netSales += toNumber(bill.netAmount);
  totals.amountPaid += toNumber(bill.amountPaid);
  totals.balance += toNumber(bill.balance);

  for (const item of bill.items) {
    const pricing = item.pricing;

    totals.piecesSold += toNumber(item.quantity) || 1;
    totals.totalWeight += toNumber(item.weight);

    if (pricing?.profitInstant != null) {
      totals.profitInstant += pricing.profitInstant;
      totals.profitInstantItems += 1;
    }

    if (pricing?.profitSource != null) {
      totals.profitSource += pricing.profitSource;
      totals.profitSourceItems += 1;
    }
  }
}

function finalizeTotals(totals) {
  return {
    ...totals,
    grossSales: money(totals.grossSales),
    discounts: money(totals.discounts),
    netSales: money(totals.netSales),
    amountPaid: money(totals.amountPaid),
    balance: money(totals.balance),
    totalWeight: round2(totals.totalWeight),
    profitInstant: money(totals.profitInstant),
    profitSource: money(totals.profitSource),
    averageBillValue: totals.bills
      ? money(totals.netSales / totals.bills)
      : 0,
  };
}

export async function GET(request) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("sivaah_admin_access")?.value;

    if (!(await isAdminTokenValid(token))) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    await connectDB();

    const { searchParams } = new URL(request.url);

    const from = searchParams.get("from");
    const to = searchParams.get("to");

    if (!from || !to) {
      return NextResponse.json(
        {
          success: false,
          error: "Both from and to dates are required.",
        },
        { status: 400 }
      );
    }

    const startDate = startOfIndiaDay(from);
    const endDate = endOfIndiaDay(to);

    if (
      Number.isNaN(startDate.getTime()) ||
      Number.isNaN(endDate.getTime()) ||
      startDate > endDate
    ) {
      return NextResponse.json(
        { success: false, error: "Invalid date range." },
        { status: 400 }
      );
    }

    // Only completed bills are counted in sales/profit reports.
    const sales = await Sale.find({
      status: "completed",
      createdAt: {
        $gte: startDate,
        $lte: endDate,
      },
    })
      .sort({ createdAt: -1 })
      .lean();

    const bills = sales.map((sale) => {
      const items = (sale.items || []).map((item) => {
        const pricing = getItemPricing(
          item,
          sale.silverRateAtSale
        );

        return {
          ...item,
          quantity: toNumber(item.quantity) || 1,
          weight: toNumber(item.weight),
          listPrice: money(item.listPrice),
          discountAmount: money(item.discountAmount),
          finalPrice: money(item.finalPrice),
          pricing,
        };
      });

      const profitInstant = items.reduce(
        (sum, item) =>
          sum + (item.pricing.profitInstant ?? 0),
        0
      );

      const profitSource = items.reduce(
        (sum, item) =>
          sum + (item.pricing.profitSource ?? 0),
        0
      );

      const instantCount = items.filter(
        (item) => item.pricing.profitInstant != null
      ).length;

      const sourceCount = items.filter(
        (item) => item.pricing.profitSource != null
      ).length;

      return {
        _id: String(sale._id),
        billNumber: sale.billNumber || "—",
        createdAt: sale.createdAt,
        customerName:
          sale.customerSnapshot?.name || "Walk-in Customer",
        salespersonName: sale.salespersonName || "—",
        silverRateAtSale: toNumber(sale.silverRateAtSale),
        grossAmount: money(sale.grossAmount),
        discountAmount: money(sale.discountAmount),
        netAmount: money(sale.netAmount),
        amountPaid: money(sale.amountPaid),
        balance: money(sale.balance),
        paymentMethod: sale.paymentMethod || "—",
        paymentSummary: sale.paymentSummary || [],
        items,
        profitInstant: instantCount ? money(profitInstant) : null,
        profitSource: sourceCount ? money(profitSource) : null,
        profitInstantItems: instantCount,
        profitSourceItems: sourceCount,
      };
    });

    const summary = emptyTotals();
    for (const bill of bills) addBillToTotals(summary, bill);

    // Daily totals.
    const dailyMap = new Map();

    for (const bill of bills) {
      const key = getIndiaDateKey(bill.createdAt);

      if (!dailyMap.has(key)) {
        dailyMap.set(key, emptyTotals());
      }

      addBillToTotals(dailyMap.get(key), bill);
    }

    const daily = [...dailyMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, totals]) => ({
        date,
        ...finalizeTotals(totals),
      }));

    // Monthly totals.
    const monthlyMap = new Map();

    for (const bill of bills) {
      const key = getIndiaMonthKey(bill.createdAt);

      if (!monthlyMap.has(key)) {
        monthlyMap.set(key, emptyTotals());
      }

      addBillToTotals(monthlyMap.get(key), bill);
    }

    const monthly = [...monthlyMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, totals]) => ({
        month,
        ...finalizeTotals(totals),
      }));

    // Product performance.
    const productMap = new Map();

    for (const bill of bills) {
      for (const item of bill.items) {
        const key = String(item.productId || item.sku || item.name);

        if (!productMap.has(key)) {
          productMap.set(key, {
            key,
            name: item.name || "Unnamed product",
            sku: item.sku || "—",
            unitsSold: 0,
            revenue: 0,
            discounts: 0,
            profitInstant: 0,
            profitSource: 0,
            instantCount: 0,
            sourceCount: 0,
          });
        }

        const product = productMap.get(key);
        product.unitsSold += toNumber(item.quantity) || 1;
        product.revenue += toNumber(item.finalPrice);
        product.discounts += toNumber(item.discountAmount);

        if (item.pricing.profitInstant != null) {
          product.profitInstant += item.pricing.profitInstant;
          product.instantCount += 1;
        }

        if (item.pricing.profitSource != null) {
          product.profitSource += item.pricing.profitSource;
          product.sourceCount += 1;
        }
      }
    }

    const bestSellers = [...productMap.values()]
      .map((product) => ({
        ...product,
        revenue: money(product.revenue),
        discounts: money(product.discounts),
        profitInstant: product.instantCount
          ? money(product.profitInstant)
          : null,
        profitSource: product.sourceCount
          ? money(product.profitSource)
          : null,
      }))
      .sort((a, b) => b.unitsSold - a.unitsSold);

    // Stock alerts use the Product.pieces structure.
    const products = await Product.find({})
      .select("name sku active pieces")
      .lean();

    const stockAlerts = products.map((product) => {
      const pieces = Array.isArray(product.pieces)
        ? product.pieces
        : [];

      const inStock = pieces.filter(
        (piece) => piece.status === "inStock"
      );

      return {
        productId: String(product._id),
        name: product.name || "Unnamed product",
        sku: product.sku || "—",
        active: product.active !== false,
        stockCount: inStock.length,
        stockWeight: round2(
          inStock.reduce(
            (sum, piece) => sum + toNumber(piece.weight),
            0
          )
        ),
        inStockPieces: inStock.map((piece) => ({
          pieceId: String(piece._id),
          batchId: piece.batchId || "",
          weight: toNumber(piece.weight),
        })),
      };
    });

    const onePieceLeft = stockAlerts.filter(
      (product) => product.stockCount === 1
    );

    const lowStock = stockAlerts.filter(
      (product) =>
        product.stockCount > 1 && product.stockCount <= 3
    );

    const outOfStock = stockAlerts.filter(
      (product) =>
        product.active && product.stockCount === 0
    );

    const paymentMap = new Map();

    for (const bill of bills) {
      const lines =
        Array.isArray(bill.paymentSummary) &&
        bill.paymentSummary.length
          ? bill.paymentSummary
          : [
              {
                method: bill.paymentMethod,
                amount: bill.amountPaid,
              },
            ];

      for (const line of lines) {
        const method = line.method || "Other";

        paymentMap.set(
          method,
          (paymentMap.get(method) || 0) + toNumber(line.amount)
        );
      }
    }

    const paymentBreakdown = [...paymentMap.entries()]
      .map(([method, amount]) => ({
        method,
        amount: money(amount),
      }))
      .sort((a, b) => b.amount - a.amount);

    const salespersonMap = new Map();

    for (const bill of bills) {
      const name = bill.salespersonName || "—";

      if (!salespersonMap.has(name)) {
        salespersonMap.set(name, {
          name,
          bills: 0,
          netSales: 0,
          profitInstant: 0,
          profitSource: 0,
        });
      }

      const row = salespersonMap.get(name);
      row.bills += 1;
      row.netSales += toNumber(bill.netAmount);

      for (const item of bill.items) {
        if (item.pricing.profitInstant != null) {
          row.profitInstant += item.pricing.profitInstant;
        }

        if (item.pricing.profitSource != null) {
          row.profitSource += item.pricing.profitSource;
        }
      }
    }

    const salespersons = [...salespersonMap.values()]
      .map((row) => ({
        ...row,
        netSales: money(row.netSales),
        profitInstant: money(row.profitInstant),
        profitSource: money(row.profitSource),
      }))
      .sort((a, b) => b.netSales - a.netSales);

    return NextResponse.json({
      success: true,
      dateRange: { from, to },
      summary: finalizeTotals(summary),
      daily,
      monthly,
      bills,
      bestSellers,
      stock: {
        onePieceLeft,
        lowStock,
        outOfStock,
        totalProducts: stockAlerts.length,
        totalInStockPieces: stockAlerts.reduce(
          (sum, product) => sum + product.stockCount,
          0
        ),
      },
      paymentBreakdown,
      salespersons,
    });
  } catch (error) {
    console.error("Admin reports error:", error);

    return NextResponse.json(
      {
        success: false,
        error: error.message || "Unable to load reports.",
      },
      { status: 500 }
    );
  }
}
