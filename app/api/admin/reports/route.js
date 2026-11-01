import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import connectDB from "../../../../lib/db";
import { verifyAdminToken } from "../../../../lib/admin-auth";

import Sale from "../../../models/Sale";
import Product from "../../../models/Product";
import SilverMatch from "../../../models/SilverMatch";
import OutletTransaction from "../../../models/OutletTransaction";

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function money(value) {
  return Math.round(num(value) * 100) / 100;
}

function round3(value) {
  return Math.round(num(value) * 1000) / 1000;
}

function startOfIndiaDay(dateString) {
  return new Date(`${dateString}T00:00:00.000+05:30`);
}

function endOfIndiaDay(dateString) {
  return new Date(`${dateString}T23:59:59.999+05:30`);
}

function indiaDateKey(date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(date));
}

function indiaMonthKey(date) {
  return indiaDateKey(date).slice(0, 7);
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
    operatingMargin: 0,
    itemsWithProfit: 0,
    itemsMissingProfit: 0,
  };
}

function addBillToTotals(totals, bill) {
  totals.bills += 1;
  totals.grossSales += num(bill.grossAmount);
  totals.discounts += num(bill.discountAmount);
  totals.netSales += num(bill.netAmount);
  totals.amountPaid += num(bill.amountPaid);
  totals.balance += num(bill.balance);

  for (const item of bill.items || []) {
    totals.piecesSold += num(item.quantity) || 1;
    totals.totalWeight += num(item.weight);

    if (item.operatingMargin !== null) {
      totals.operatingMargin += item.operatingMargin;
      totals.itemsWithProfit += 1;
    } else {
      totals.itemsMissingProfit += 1;
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
    totalWeight: round3(totals.totalWeight),
    operatingMargin: money(totals.operatingMargin),
    averageBillValue: totals.bills
      ? money(totals.netSales / totals.bills)
      : 0,
  };
}

function getProfitSnapshot(item) {
  // Never recalculate an old sale using today's silver rate.
  const value = item?.profitAtSale;

  return value === null || value === undefined
    ? null
    : money(value);
}

export async function GET(request) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("sivaah_admin_access")?.value;

    if (!token || !(await verifyAdminToken(token))) {
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

    // 1. Sales in the selected period.
    const sales = await Sale.find({
      status: "completed",
      createdAt: { $gte: startDate, $lte: endDate },
    })
      .sort({ createdAt: -1 })
      .lean();

    const bills = sales.map((sale) => {
      const items = (sale.items || []).map((item) => ({
        ...item,
        quantity: num(item.quantity) || 1,
        weight: num(item.weight),
        listPrice: money(item.listPrice),
        discountAmount: money(item.discountAmount),
        finalPrice: money(item.finalPrice),
        operatingMargin: getProfitSnapshot(item),
        profitStatus:
          getProfitSnapshot(item) === null
            ? "Missing sale-time profit snapshot"
            : "Recorded at sale",
      }));

      const validItems = items.filter(
        (item) => item.operatingMargin !== null
      );

      const operatingMargin = validItems.reduce(
        (sum, item) => sum + item.operatingMargin,
        0
      );

      return {
        _id: String(sale._id),
        billNumber: sale.billNumber || "—",
        createdAt: sale.createdAt,
        customerName:
          sale.customerSnapshot?.name || "Walk-in Customer",
        salespersonName: sale.salespersonName || "—",
        silverRateAtSale: num(sale.silverRateAtSale),
        grossAmount: money(sale.grossAmount),
        discountAmount: money(sale.discountAmount),
        netAmount: money(sale.netAmount),
        amountPaid: money(sale.amountPaid),
        balance: money(sale.balance),
        paymentMethod: sale.paymentMethod || "—",
        paymentSummary: sale.paymentSummary || [],
        items,
        operatingMargin:
          validItems.length === items.length
            ? money(operatingMargin)
            : null,
        itemsWithProfit: validItems.length,
        itemsMissingProfit: items.length - validItems.length,
      };
    });

    // 2. Expenses in the selected period.
    // Purchases, capital, loans, transfers and withdrawals are excluded.
    const expenseTransactions = await OutletTransaction.find({
      isVoided: { $ne: true },
      profitTreatment: "expense",
      transactionDate: { $gte: startDate, $lte: endDate },
    })
      .sort({ transactionDate: -1 })
      .lean();

    const expenses = money(
      expenseTransactions.reduce(
        (sum, entry) => sum + num(entry.amount),
        0
      )
    );

    const expenseRows = expenseTransactions.map((entry) => ({
      _id: String(entry._id),
      date: entry.transactionDate,
      category: entry.category || "Other",
      description: entry.description || "",
      amount: money(entry.amount),
      paymentMethod: entry.paymentMethod || "—",
      account: entry.account || "—",
    }));

    // 3. Confirmed silver matches in the selected period.
    // Match adjustments belong to matchDate, not the original sale date.
    const confirmedMatches = await SilverMatch.find({
      status: "confirmed",
      matchDate: { $gte: startDate, $lte: endDate },
    })
      .sort({ matchDate: -1 })
      .lean();

    const confirmedSilverAdjustment = money(
      confirmedMatches.reduce(
        (sum, match) => sum + num(match.adjustmentPaise) / 100,
        0
      )
    );

    const matchedGramsInPeriod = round3(
      confirmedMatches.reduce(
        (sum, match) => sum + num(match.matchedGrams),
        0
      )
    );

    // 4. Outstanding sold silver as of the selected end date.
    // This includes earlier sales still awaiting replacement.
    const allSalesUntilEnd = await Sale.find({
      status: "completed",
      createdAt: { $lte: endDate },
    })
      .select("_id items")
      .lean();

    const allConfirmedMatchesUntilEnd = await SilverMatch.find({
      status: "confirmed",
      matchDate: { $lte: endDate },
    })
      .select("saleId pieceId matchedGrams")
      .lean();

    const matchedBySalePiece = new Map();

    for (const match of allConfirmedMatchesUntilEnd) {
      const key = `${String(match.saleId)}_${String(match.pieceId)}`;
      matchedBySalePiece.set(
        key,
        (matchedBySalePiece.get(key) || 0) + num(match.matchedGrams)
      );
    }

    let totalSoldGramsUntilEnd = 0;
    let totalMatchedGramsUntilEnd = 0;

    for (const sale of allSalesUntilEnd) {
      for (const item of sale.items || []) {
        const weight = num(item.weight);
        const pieceId = item.pieceId ? String(item.pieceId) : "";

        if (weight <= 0 || !pieceId) continue;

        const key = `${String(sale._id)}_${pieceId}`;
        const matched = matchedBySalePiece.get(key) || 0;

        totalSoldGramsUntilEnd += weight;
        totalMatchedGramsUntilEnd += Math.min(weight, matched);
      }
    }

    const unmatchedSoldGrams = round3(
      Math.max(0, totalSoldGramsUntilEnd - totalMatchedGramsUntilEnd)
    );

    // 5. Main profit calculation.
    const summary = emptyTotals();
    for (const bill of bills) addBillToTotals(summary, bill);

    const operatingMargin = money(summary.operatingMargin);
    const realProfit = money(
      operatingMargin + confirmedSilverAdjustment - expenses
    );

    // 6. Daily sales and operating margin.
    const dailyMap = new Map();

    for (const bill of bills) {
      const key = indiaDateKey(bill.createdAt);

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

    // 7. Monthly sales and operating margin.
    const monthlyMap = new Map();

    for (const bill of bills) {
      const key = indiaMonthKey(bill.createdAt);

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

    // 8. Product performance.
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
            operatingMargin: 0,
            itemsWithProfit: 0,
            itemsMissingProfit: 0,
          });
        }

        const product = productMap.get(key);
        product.unitsSold += num(item.quantity) || 1;
        product.revenue += num(item.finalPrice);
        product.discounts += num(item.discountAmount);

        if (item.operatingMargin !== null) {
          product.operatingMargin += item.operatingMargin;
          product.itemsWithProfit += 1;
        } else {
          product.itemsMissingProfit += 1;
        }
      }
    }

    const bestSellers = [...productMap.values()]
      .map((product) => ({
        ...product,
        revenue: money(product.revenue),
        discounts: money(product.discounts),
        operatingMargin: money(product.operatingMargin),
      }))
      .sort((a, b) => b.unitsSold - a.unitsSold);

    // 9. Stock alerts.
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
        stockWeight: round3(
          inStock.reduce(
            (sum, piece) => sum + num(piece.weight),
            0
          )
        ),
        inStockPieces: inStock.map((piece) => ({
          pieceId: String(piece._id),
          batchId: piece.batchId || "",
          weight: num(piece.weight),
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

    // 10. Payment breakdown.
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
          (paymentMap.get(method) || 0) + num(line.amount)
        );
      }
    }

    const paymentBreakdown = [...paymentMap.entries()]
      .map(([method, amount]) => ({
        method,
        amount: money(amount),
      }))
      .sort((a, b) => b.amount - a.amount);

    // 11. Salesperson report.
    const salespersonMap = new Map();

    for (const bill of bills) {
      const name = bill.salespersonName || "—";

      if (!salespersonMap.has(name)) {
        salespersonMap.set(name, {
          name,
          bills: 0,
          netSales: 0,
          operatingMargin: 0,
          billsWithMissingProfit: 0,
        });
      }

      const row = salespersonMap.get(name);
      row.bills += 1;
      row.netSales += num(bill.netAmount);

      if (bill.operatingMargin !== null) {
        row.operatingMargin += bill.operatingMargin;
      } else {
        row.billsWithMissingProfit += 1;
      }
    }

    const salespersons = [...salespersonMap.values()]
      .map((row) => ({
        ...row,
        netSales: money(row.netSales),
        operatingMargin: money(row.operatingMargin),
      }))
      .sort((a, b) => b.netSales - a.netSales);

    return NextResponse.json({
      success: true,
      dateRange: {
        from,
        to,
      },

      summary: {
        ...finalizeTotals(summary),
        operatingMargin,
        confirmedSilverAdjustment,
        expenses,
        realProfit,
        silverSoldGrams: round3(summary.totalWeight),
        matchedGramsInPeriod,
        unmatchedSoldGrams,
        profitDataComplete: summary.itemsMissingProfit === 0,
        profitDataWarning:
          summary.itemsMissingProfit > 0
            ? `${summary.itemsMissingProfit} sold item(s) have no saved sale-time profit snapshot. Their profit is excluded rather than guessed.`
            : null,
      },

      silver: {
        soldGramsInPeriod: round3(summary.totalWeight),
        matchedGramsInPeriod,
        unmatchedSoldGrams,
        confirmedAdjustment: confirmedSilverAdjustment,
        matchCount: confirmedMatches.length,
      },

      expenses: {
        total: expenses,
        count: expenseRows.length,
        rows: expenseRows,
      },

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

      profitFormula:
        "Real profit = operating margin + confirmed silver adjustment - operating expenses.",

      note:
        "Management dashboard view. Historical profit uses sale-time snapshots only. Silver adjustments are counted on match date. Unmatched silver is shown as an outstanding quantity, not confirmed profit. GST is not separately calculated in this dashboard.",
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