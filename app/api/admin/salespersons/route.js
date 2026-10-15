
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import mongoose from "mongoose";
import { randomBytes } from "crypto";

import connectDB from "@/lib/db";
import { verifyAdminToken } from "@/lib/admin-auth";
import Salesperson from "@/app/models/Salesperson";

async function isAdmin() {
  const token = (await cookies()).get("sivaah_admin_access")?.value;
  return token ? verifyAdminToken(token) : false;
}

export async function GET() {
  try {
    if (!(await isAdmin())) {
      return NextResponse.json(
        { message: "Unauthorized" },
        { status: 401 }
      );
    }

    await connectDB();

 const salespersons = await Salesperson.aggregate([
  {
    $project: {
      uniqueId: 1,
      name: 1,
      mobile: 1,
      address: 1,
      joiningDate: 1,
      remark: 1,
      createdAt: 1,
      billsCount: {
        $size: { $ifNull: ["$bills", []] },
      },
    },
  },
  { $sort: { createdAt: -1 } },
]);
    return NextResponse.json({ salespersons });
  } catch (error) {
    console.error("Fetch salespersons error:", error);
    return NextResponse.json(
      { message: "Failed to fetch salespersons" },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    if (!(await isAdmin())) {
      return NextResponse.json(
        { message: "Unauthorized" },
        { status: 401 }
      );
    }

    const body = await request.json();

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

    let uniqueId;
    let exists = true;

    while (exists) {
      uniqueId = `SP-${new Date().getFullYear()}-${randomBytes(4)
        .toString("hex")
        .toUpperCase()}`;

      exists = Boolean(await Salesperson.exists({ uniqueId }));
    }

    const salesperson = await Salesperson.create({
      uniqueId,
      name,
      mobile,
      address,
      joiningDate: new Date(`${joiningDate}T00:00:00.000Z`),
      bills: [],
      remark,
    });

    return NextResponse.json(
      { message: "Salesperson added successfully", salesperson },
      { status: 201 }
    );
  } catch (error) {
    console.error("Create salesperson error:", error);

    if (error.code === 11000) {
      return NextResponse.json(
        { message: "Unique ID conflict. Please try again." },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { message: "Failed to add salesperson" },
      { status: 500 }
    );
  }
}
