
import { NextResponse } from "next/server";
import mongoose from "mongoose";

import connectDB from "../../../../../lib/db";
import Sale from "../../../../models/Sale";

export async function GET(request, { params }) {
  try {
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
