
import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import connectDB from "@/lib/db";
import { verifyAdminToken } from "@/lib/admin-auth";
import Salesperson from "@/app/models/Salesperson";

async function isAdmin() {
  const token = (await cookies()).get("sivaah_admin_access")?.value;
  return token ? verifyAdminToken(token) : false;
}

export async function GET(request, { params }) {
  try {
    if (!(await isAdmin())) {
      return NextResponse.json(
        { message: "Unauthorized" },
        { status: 401 }
      );
    }

    await connectDB();
    const { id } = await params;

    const salesperson = await Salesperson.findById(id).lean();

    if (!salesperson) {
      return NextResponse.json(
        { message: "Salesperson not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ salesperson });
  } catch (error) {
    console.error("Get salesperson error:", error);
    return NextResponse.json(
      { message: "Failed to fetch salesperson" },
      { status: 500 }
    );
  }
}

export async function PATCH(request, { params }) {
  try {
    if (!(await isAdmin())) {
      return NextResponse.json(
        { message: "Unauthorized" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { id } = await params;

    const name = String(body.name || "").trim();
    const mobile = String(body.mobile || "").trim();
    const address = String(body.address || "").trim();
    const remark = String(body.remark || "").trim();
    const joiningDate = body.joiningDate;

    if (!name || !mobile || !address || !joiningDate) {
      return NextResponse.json(
        { message: "Name, mobile, address and joining date are required." },
        { status: 400 }
      );
    }

    if (!/^\d{10}$/.test(mobile)) {
      return NextResponse.json(
        { message: "Enter a valid 10-digit mobile number." },
        { status: 400 }
      );
    }

    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(joiningDate) ||
      Number.isNaN(Date.parse(`${joiningDate}T00:00:00.000Z`))
    ) {
      return NextResponse.json(
        { message: "Enter a valid joining date." },
        { status: 400 }
      );
    }

    await connectDB();

    const salesperson = await Salesperson.findById(id);

    if (!salesperson) {
      return NextResponse.json(
        { message: "Salesperson not found" },
        { status: 404 }
      );
    }

    salesperson.name = name;
    salesperson.mobile = mobile;
    salesperson.address = address;
    salesperson.joiningDate = new Date(
      `${joiningDate}T00:00:00.000Z`
    );
    salesperson.remark = remark;

    // Keep uniqueId and bills unchanged.
    await salesperson.save();

    return NextResponse.json({
      message: "Salesperson updated successfully",
      salesperson,
    });
  } catch (error) {
    console.error("Update salesperson error:", error);
    return NextResponse.json(
      { message: "Failed to update salesperson" },
      { status: 500 }
    );
  }
}
