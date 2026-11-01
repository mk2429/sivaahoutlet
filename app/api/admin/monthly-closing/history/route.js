import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import connectDB from "../../../../../lib/db";
import { verifyAdminToken } from "../../../../../lib/admin-auth";
import OutletMonthClose from "../../../../models/OutletMonthClose";

export async function GET() {
    try {
        // Admin authentication
        const cookieStore = await cookies();
        const token = cookieStore.get("sivaah_admin_access")?.value;

        if (!token || !(await verifyAdminToken(token))) {
            return NextResponse.json(
                { success: false, message: "Unauthorized" },
                { status: 401 }
            );
        }

        await connectDB();

        const months = await OutletMonthClose.find({})
            .select(
                "monthKey opening closing profit physicalCashCountPaise physicalSilverCountGrams cashDifferencePaise silverDifferenceGrams status notes closedAt closedBy previousMonthCloseId createdAt updatedAt"
            )
            .sort({ monthKey: -1 })
            .lean();

        const history = months.map((month) => ({
            id: String(month._id),
            monthKey: month.monthKey,
            status: month.status,

            opening: {
                cash: Number(month.opening?.cashPaise || 0) / 100,
                bank: Number(month.opening?.bankPaise || 0) / 100,
                silverGrams: month.opening?.silverGrams ?? 0,
            },

            closing: {
                cash: Number(month.closing?.cashPaise || 0) / 100,
                bank: Number(month.closing?.bankPaise || 0) / 100,
                silverGrams: month.closing?.silverGrams ?? 0,
            },

            profit: {
                netSales:
                    month.profit?.netSalesPaise == null
                        ? null
                        : month.profit.netSalesPaise / 100,

                operatingMargin:
                    month.profit?.operatingMarginPaise == null
                        ? null
                        : month.profit.operatingMarginPaise / 100,

                confirmedRealProfit:
                    month.profit?.confirmedRealProfitPaise == null
                        ? null
                        : month.profit.confirmedRealProfitPaise / 100,

                estimatedRealProfit:
                    month.profit?.estimatedRealProfitPaise == null
                        ? null
                        : month.profit.estimatedRealProfitPaise / 100,
            },

            physicalCounts: {
                cash:
                    month.physicalCashCountPaise == null
                        ? null
                        : month.physicalCashCountPaise / 100,

                silverGrams: month.physicalSilverCountGrams ?? null,
            },

            differences: {
                cash:
                    month.cashDifferencePaise == null
                        ? null
                        : month.cashDifferencePaise / 100,

                silverGrams: month.silverDifferenceGrams ?? null,
            },

            notes: month.notes || "",
            closedAt: month.closedAt,
            closedBy: month.closedBy,
            previousMonthCloseId: month.previousMonthCloseId,
            updatedAt: month.updatedAt,
        }));

        return NextResponse.json({
            success: true,
            count: history.length,
            history,
        });
    } catch (error) {
        console.error("Monthly closing history error:", error);

        return NextResponse.json(
            {
                success: false,
                message: "Unable to fetch monthly closing history.",
            },
            { status: 500 }
        );
    }
}