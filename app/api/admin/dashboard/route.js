
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import connectDB from "../../../../lib/db";
import { verifyAdminToken } from "../../../../lib/admin-auth";
import Product from "../../../models/Product";
import Sale from "../../../models/Sale";

function decodeBatch(batchId) {
  const id = String(batchId || "");
  if (!/^\d{14}$/.test(id)) return null;

  return {
    sourceRate: Number(id.slice(8, 11)),
    labourPerGram: Number(id.slice(11, 14)),
  };
}

function getTodayRange() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const get = (type) => parts.find((p) => p.type === type)?.value;
  const day = `${get("year")}-${get("month")}-${get("day")}`;

  return {
    day,
    start: new Date(`${day}T00:00:00+05:30`),
    end: new Date(`${day}T23:59:59.999+05:30`),
  };
}

const num = (value) => {
  const result = Number(value);
  return Number.isFinite(result) ? result : 0;
};

function getPaymentBreakdown(sale) {
  const paid = Math.max(0, num(sale.amountPaid));
  const rows = Array.isArray(sale.paymentSummary)
    ? sale.paymentSummary
    : [];

  const total = rows.reduce(
    (sum, row) => sum + Math.max(0, num(row.amount)),
    0
  );

  if (rows.length && Math.abs(total - paid) < 0.02) {
    return rows.map((row) => ({
      method: String(row.method || "").toLowerCase(),
      amount: Math.max(0, num(row.amount)),
    }));
  }

  return paid > 0
    ? [{
        method: String(sale.paymentMethod || "").toLowerCase(),
        amount: paid,
      }]
    : [];
}

export async function GET() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("sivaah_admin_access")?.value;

    if (!token || !(await verifyAdminToken(token))) {
      return NextResponse.json(
        { success: false, message: "Unauthorized" },
        { status: 401 }
      );
    }

    await connectDB();

    const { day, start, end } = getTodayRange();

    const [sales, products] = await Promise.all([
      Sale.find({
        status: "completed",
        createdAt: { $gte: start, $lte: end },
      }).lean(),
      Product.find({ active: { $ne: false } })
        .select("pieces")
        .lean(),
    ]);

    const todaySales = sales.reduce(
      (sum, sale) => sum + num(sale.netAmount),
      0
    );

    let cashReceived = 0;
    let upiReceived = 0;
    let totalReceived = 0;

    for (const sale of sales) {
      for (const payment of getPaymentBreakdown(sale)) {
        totalReceived += payment.amount;

        if (payment.method === "cash") {
          cashReceived += payment.amount;
        } else if (payment.method === "upi") {
          upiReceived += payment.amount;
        }
      }
    }

    const outletPieces = products.reduce(
      (total, product) =>
        total +
        (product.pieces || []).filter(
          (piece) => piece.status === "inStock"
        ).length,
      0
    );

    let instantProfit = 0;
    let itemsWithUnknownCost = 0;
    let soldPiecesCount = 0;

    for (const sale of sales) {
      for (const item of sale.items || []) {
        soldPiecesCount += 1;

        const weight = num(item.weight);
        const silverRate = num(sale.silverRateAtSale);
        const batch = decodeBatch(item.batchId);

        if (!weight || !silverRate || !batch) {
          itemsWithUnknownCost += 1;
          continue;
        }

        const instantCP =
          weight * (silverRate + batch.labourPerGram) + 50;

        instantProfit += num(item.finalPrice) - instantCP;
      }
    }

    return NextResponse.json({
      success: true,
      date: day,
      metrics: {
        todaySales,
        cashReceived,
        upiReceived,
        totalReceived,
        outletPieces,
        instantProfit,
        soldPiecesCount,
        itemsWithUnknownCost,
      },
    });
  } catch (error) {
    console.error("Dashboard API error:", error);

    return NextResponse.json(
      { success: false, message: "Failed to load dashboard data" },
      { status: 500 }
    );
  }
}
