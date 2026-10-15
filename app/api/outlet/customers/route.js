
import { NextResponse } from "next/server";
import connectDB from "@/lib/db";
import Customer from "@/app/models/Customer";

function normalizePhone(value) {
  return String(value || "").replace(/\D/g, "").slice(-15);
}

export async function GET(request) {
  try {
    await connectDB();

    const { searchParams } = new URL(request.url);
    const q = (searchParams.get("q") || "").trim();

    const filter = {};

    if (q) {
      const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

      filter.$or = [
        { name: { $regex: escaped, $options: "i" } },
        { whatsappNumber: { $regex: escaped } },
      ];
    }

    const customers = await Customer.find(filter)
      .select("-__v")
      .sort({ updatedAt: -1 })
      .limit(100)
      .lean();

    return NextResponse.json({
      success: true,
      customers,
    });
  } catch (error) {
    console.error("Load customers:", error);

    return NextResponse.json(
      { success: false, message: "Could not load customers." },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    await connectDB();

    const body = await request.json();

    const name = String(body.name || "").trim();
    const whatsappNumber = normalizePhone(body.whatsappNumber);
    const gender = String(body.gender || "");
    const address = String(body.address || "").trim();

    if (!name) {
      return NextResponse.json(
        { success: false, message: "Customer name is required." },
        { status: 400 }
      );
    }

    if (!/^\d{10,15}$/.test(whatsappNumber)) {
      return NextResponse.json(
        { success: false, message: "Enter a valid WhatsApp number." },
        { status: 400 }
      );
    }

    if (
      !["Female", "Male", "Other", "Prefer not to say"].includes(gender)
    ) {
      return NextResponse.json(
        { success: false, message: "Select a valid gender." },
        { status: 400 }
      );
    }

    const existing = await Customer.findOne({ whatsappNumber })
      .select("_id name")
      .lean();

    if (existing) {
      return NextResponse.json(
        {
          success: false,
          message: `This number is already registered to ${existing.name}.`,
          customerId: String(existing._id),
        },
        { status: 409 }
      );
    }

    const customer = await Customer.create({
      name,
      whatsappNumber,
      gender,
      address,
      dateOfBirth: body.dateOfBirth || null,
      anniversaryDate: body.anniversaryDate || null,
    });

    return NextResponse.json(
      {
        success: true,
        message: "Customer added successfully.",
        customer,
      },
      { status: 201 }
    );
  } catch (error) {
    if (error?.code === 11000) {
      return NextResponse.json(
        { success: false, message: "This WhatsApp number already exists." },
        { status: 409 }
      );
    }

    console.error("Create customer:", error);

    return NextResponse.json(
      { success: false, message: "Could not save customer." },
      { status: 500 }
    );
  }
}
