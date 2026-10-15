
import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import connectDB from "../../../../lib/db";
import { verifyAdminToken } from "../../../../lib/admin-auth";
import Sale from "../../../models/Sale";

async function isAdmin() {
  const cookieStore = await cookies();
  const token = cookieStore.get("sivaah_admin_access")?.value;
  return Boolean(token && verifyAdminToken(token));
}

export async function GET() {
  try {
    if (!(await isAdmin())) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();

    const sales = await Sale.find({})
      .sort({ createdAt: -1 })
      .limit(5000)
      .lean();

    return NextResponse.json({
      success: true,
      sales: sales.map((sale) => ({
        ...sale,
        _id: String(sale._id),
        customerId: sale.customerId ? String(sale.customerId) : "",
      })),
    });
  } catch (error) {
    console.error("Admin sales list error:", error);
    return NextResponse.json(
      { error: "Unable to load bills." },
      { status: 500 }
    );
  }
}
