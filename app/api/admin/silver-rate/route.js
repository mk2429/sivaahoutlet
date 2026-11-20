import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import connectDB from "@/lib/db";
import SilverRate from "@/app/models/SilverRate";
import { verifyAdminToken } from "@/lib/admin-auth";

async function isAdmin() {
  const token = (await cookies()).get("sivaah_admin_access")?.value;
  return token ? verifyAdminToken(token) : false;
}

export async function GET() {
  try {
    await connectDB();

    const rate = await SilverRate.findOne({ metal: "silver" }).lean();

    return NextResponse.json({
      success: true,
      rate: rate
        ? {
            ratePerGram: rate.ratePerGram,
            updatedBy: rate.updatedBy,
            updatedAt: rate.updatedAt,
          }
        : null,
    });
  } catch (error) {
    console.error("Silver rate GET error:", error);

    return NextResponse.json(
      { success: false, message: "Could not load silver rate" },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    if (!(await isAdmin())) {
      return NextResponse.json(
        { success: false, message: "Unauthorized" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const ratePerGram = Number(body.ratePerGram);

    if (
      !Number.isFinite(ratePerGram) ||
      ratePerGram <= 0 ||
      ratePerGram > 100000
    ) {
      return NextResponse.json(
        { success: false, message: "Enter a valid silver rate." },
        { status: 400 }
      );
    }

    await connectDB();

    const rate = await SilverRate.findOneAndUpdate(
      { metal: "silver" },
      {
        $set: {
          ratePerGram,
          updatedBy: "Admin",
        },
      },
      {
        new: true,
        upsert: true,
        runValidators: true,
        setDefaultsOnInsert: true,
      }
    );

    return NextResponse.json({
      success: true,
      message: "Silver rate updated successfully.",
      rate: {
        ratePerGram: rate.ratePerGram,
        updatedBy: rate.updatedBy,
        updatedAt: rate.updatedAt,
      },
    });
  } catch (error) {
    console.error("Silver rate POST error:", error);

    return NextResponse.json(
      { success: false, message: "Could not save silver rate" },
      { status: 500 }
    );
  }
}