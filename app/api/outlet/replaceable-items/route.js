import { NextResponse } from "next/server";
import connectDB from "@/lib/db";
import Sale from "@/app/models/Sale";

export async function GET() {
  try {
    await connectDB();

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    sevenDaysAgo.setHours(0, 0, 0, 0);

    const recentSales = await Sale.find({
      status: "completed",
      createdAt: { $gte: sevenDaysAgo },
    })
      .sort({ createdAt: -1 })
      .lean();

    const items = [];

    for (const sale of recentSales) {
      const saleItems = Array.isArray(sale.items) ? sale.items : [];
      const itemsSum = saleItems.reduce(
        (sum, it) => sum + Number(it.finalPrice || 0),
        0
      );

      saleItems.forEach((item, itemIndex) => {
        if (item.isReplaced) return;

        // Calculate exact net paid value for this single item
        let creditValue = Math.round(Number(item.finalPrice || 0));
        if (
          itemsSum > 0 &&
          Math.abs(itemsSum - Number(sale.netAmount || 0)) >= 1
        ) {
          creditValue = Math.round(
            (Number(item.finalPrice || 0) / itemsSum) *
              Number(sale.netAmount || 0)
          );
        }

        items.push({
          key: `${sale._id}:${item.pieceId}:${itemIndex}`,
          saleId: String(sale._id),
          billNumber: sale.billNumber,
          saleDate: sale.createdAt,
          customerId: sale.customerId ? String(sale.customerId) : null,
          customerName: sale.customerSnapshot?.name || "Walk-in Customer",
          customerPhone: sale.customerSnapshot?.whatsappNumber || "",
          productId: String(item.productId),
          pieceId: String(item.pieceId),
          name: item.name,
          sku: item.sku || "",
          category: item.category || "",
          batchId: item.batchId || "",
          weight: Number(item.weight || 0),
          listPrice: Number(item.listPrice || 0),
          finalPrice: Number(item.finalPrice || 0),
          creditValue,
        });
      });
    }

    return NextResponse.json({
      success: true,
      items,
    });
  } catch (error) {
    console.error("Replaceable items fetch error:", error);
    return NextResponse.json(
      { success: false, error: "Could not load last 7 days sold items." },
      { status: 500 }
    );
  }
}