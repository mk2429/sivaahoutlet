import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import connectDB from "@/lib/db";
import Discount from "@/app/models/Discount";
import { verifyAdminToken } from "@/lib/admin-auth";

async function isAdmin() {
  const token = (await cookies()).get("sivaah_admin_access")?.value;
  return token ? verifyAdminToken(token) : false;
}

function validateDiscount(body) {
  const name = String(body.name || "").trim();
  const type = body.type;
  const value = Number(body.value);
  const applicability = body.applicability || "all";

  if (!name) return "Discount name is required.";

  if (!["percentage", "flat"].includes(type)) {
    return "Choose percentage or flat discount.";
  }

  if (!Number.isFinite(value) || value <= 0) {
    return "Discount value must be greater than zero.";
  }

  if (type === "percentage" && value > 100) {
    return "Percentage discount cannot exceed 100%.";
  }

  if (!["all", "category", "sku"].includes(applicability)) {
    return "Invalid applicability.";
  }

  if (applicability === "category" &&
      !(body.categories || []).some((item) => String(item).trim())) {
    return "Add at least one category.";
  }

  if (applicability === "sku" &&
      !(body.skus || []).some((item) => String(item).trim())) {
    return "Add at least one SKU.";
  }

  const minBillAmount = Number(body.minBillAmount || 0);
  const minWeightGrams = Number(body.minWeightGrams || 0);

  if (!Number.isFinite(minBillAmount) || minBillAmount < 0) {
    return "Minimum bill amount cannot be negative.";
  }

  if (!Number.isFinite(minWeightGrams) || minWeightGrams < 0) {
    return "Minimum weight cannot be negative.";
  }

  const startDate = body.startDate ? new Date(body.startDate) : null;
  const endDate = body.endDate ? new Date(body.endDate) : null;

  if (startDate && Number.isNaN(startDate.getTime())) {
    return "Invalid start date.";
  }

  if (endDate && Number.isNaN(endDate.getTime())) {
    return "Invalid end date.";
  }

  if (startDate && endDate && endDate < startDate) {
    return "End date cannot be before start date.";
  }

  return null;
}

function normalizeDiscount(body) {
  return {
    name: String(body.name).trim(),
    type: body.type,
    value: Number(body.value),
    applicability: body.applicability || "all",
    categories: (body.categories || [])
      .map((item) => String(item).trim())
      .filter(Boolean),
    skus: (body.skus || [])
      .map((item) => String(item).trim().toUpperCase())
      .filter(Boolean),
    minBillAmount: Number(body.minBillAmount || 0),
    minWeightGrams: Number(body.minWeightGrams || 0),
    startDate: body.startDate ? new Date(body.startDate) : null,
    endDate: body.endDate ? new Date(body.endDate) : null,
    active: body.active !== false,
  };
}

export async function GET() {
  try {
    if (!(await isAdmin())) {
      return NextResponse.json(
        { success: false, message: "Unauthorized." },
        { status: 401 }
      );
    }

    await connectDB();

    const discounts = await Discount.find({})
      .sort({ createdAt: -1 })
      .lean();

    return NextResponse.json({ success: true, discounts });
  } catch (error) {
    console.error("Discount GET error:", error);
    return NextResponse.json(
      { success: false, message: "Could not load discounts." },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    if (!(await isAdmin())) {
      return NextResponse.json(
        { success: false, message: "Unauthorized." },
        { status: 401 }
      );
    }

    const body = await request.json();
    const validationError = validateDiscount(body);

    if (validationError) {
      return NextResponse.json(
        { success: false, message: validationError },
        { status: 400 }
      );
    }

    await connectDB();

    const discount = await Discount.create(normalizeDiscount(body));

    return NextResponse.json(
      { success: true, discount, message: "Discount created." },
      { status: 201 }
    );
  } catch (error) {
    console.error("Discount POST error:", error);
    return NextResponse.json(
      { success: false, message: "Could not create discount." },
      { status: 500 }
    );
  }
}

export async function PATCH(request) {
  try {
    if (!(await isAdmin())) {
      return NextResponse.json(
        { success: false, message: "Unauthorized." },
        { status: 401 }
      );
    }

    const body = await request.json();
    const id = String(body._id || "");

    if (!/^[a-f\d]{24}$/i.test(id)) {
      return NextResponse.json(
        { success: false, message: "Invalid discount ID." },
        { status: 400 }
      );
    }

    const validationError = validateDiscount(body);

    if (validationError) {
      return NextResponse.json(
        { success: false, message: validationError },
        { status: 400 }
      );
    }

    await connectDB();

    const discount = await Discount.findByIdAndUpdate(
      id,
      normalizeDiscount(body),
      { new: true, runValidators: true }
    );

    if (!discount) {
      return NextResponse.json(
        { success: false, message: "Discount not found." },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      discount,
      message: "Discount updated.",
    });
  } catch (error) {
    console.error("Discount PATCH error:", error);
    return NextResponse.json(
      { success: false, message: "Could not update discount." },
      { status: 500 }
    );
  }
}