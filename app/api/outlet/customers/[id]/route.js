
import { NextResponse } from "next/server";
import mongoose from "mongoose";
import connectDB from "@/lib/db";
import Customer from "@/app/models/Customer";

function normalizePhone(value) {
  return String(value || "").replace(/\D/g, "").slice(-15);
}

export async function GET(_request, { params }) {
  try {
    await connectDB();

    const { id } = await params;

    if (!mongoose.isValidObjectId(id)) {
      return NextResponse.json(
        { success: false, message: "Invalid customer ID." },
        { status: 400 }
      );
    }

    const customer = await Customer.findById(id)
      .select("-__v")
      .lean();

    if (!customer) {
      return NextResponse.json(
        { success: false, message: "Customer not found." },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      customer,
    });
  } catch (error) {
    console.error("Get customer:", error);

    return NextResponse.json(
      { success: false, message: "Could not load customer." },
      { status: 500 }
    );
  }
}

export async function PATCH(request, { params }) {
  try {
    await connectDB();

    const { id } = await params;

    if (!mongoose.isValidObjectId(id)) {
      return NextResponse.json(
        { success: false, message: "Invalid customer ID." },
        { status: 400 }
      );
    }

    const body = await request.json();
    const update = {};

    if (body.name !== undefined) {
      update.name = String(body.name || "").trim();

      if (!update.name) {
        return NextResponse.json(
          { success: false, message: "Customer name is required." },
          { status: 400 }
        );
      }
    }

    if (body.whatsappNumber !== undefined) {
      const phone = normalizePhone(body.whatsappNumber);

      if (!/^\d{10,15}$/.test(phone)) {
        return NextResponse.json(
          { success: false, message: "Enter a valid WhatsApp number." },
          { status: 400 }
        );
      }

      update.whatsappNumber = phone;
    }

    if (body.gender !== undefined) {
      if (
        !["Female", "Male", "Other", "Prefer not to say"].includes(body.gender)
      ) {
        return NextResponse.json(
          { success: false, message: "Select a valid gender." },
          { status: 400 }
        );
      }

      update.gender = body.gender;
    }

    if (body.address !== undefined) {
      update.address = String(body.address || "").trim();
    }

    if (body.dateOfBirth !== undefined) {
      update.dateOfBirth = body.dateOfBirth || null;
    }

    if (body.anniversaryDate !== undefined) {
      update.anniversaryDate = body.anniversaryDate || null;
    }

    const customer = await Customer.findByIdAndUpdate(
      id,
      { $set: update },
      { new: true, runValidators: true }
    );

    if (!customer) {
      return NextResponse.json(
        { success: false, message: "Customer not found." },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Customer updated successfully.",
      customer,
    });
  } catch (error) {
    if (error?.code === 11000) {
      return NextResponse.json(
        { success: false, message: "This WhatsApp number already exists." },
        { status: 409 }
      );
    }

    console.error("Update customer:", error);

    return NextResponse.json(
      { success: false, message: "Could not update customer." },
      { status: 500 }
    );
  }
}
