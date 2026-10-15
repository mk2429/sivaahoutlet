import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import mongoose from "mongoose";

import connectDB from "../../../../../lib/db";
import { verifyAdminToken } from "../../../../../lib/admin-auth";
import Sale from "../../../../models/Sale";

export async function GET(request, { params }) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("sivaah_admin_access")?.value;

    if (!token || !verifyAdminToken(token)) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { id } = await params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json(
        { error: "Invalid invoice ID." },
        { status: 400 }
      );
    }

    await connectDB();

    const sale = await Sale.findById(id).lean();

    if (!sale) {
      return NextResponse.json(
        { error: "Invoice not found." },
        { status: 404 }
      );
    }

    const seller = {
      legalName:
        process.env.SELLER_LEGAL_NAME || "Shri Narain Jewellers",
      gstin:
        process.env.SELLER_GSTIN || "09AAWHS3038L1ZB",
      address: process.env.SELLER_ADDRESS || "",
      phone: process.env.SELLER_PHONE || "",
      email: process.env.SELLER_EMAIL || "",
      outletAddress: process.env.OUTLET_ADDRESS || "",
    };

    return NextResponse.json({ sale, seller });
  } catch (error) {
    console.error("Invoice retrieval error:", error);

    return NextResponse.json(
      { error: "Unable to load invoice." },
      { status: 500 }
    );
  }
}