import { NextResponse } from "next/server";
import connectDB from "@/lib/db";
import Salesperson from "@/app/models/Salesperson";

export async function GET() {
  try {
    await connectDB();

    const salespersons = await Salesperson.find({})
      .select("uniqueId name")
      .sort({ name: 1 })
      .lean();

    return NextResponse.json({
      salespersons: salespersons.map((person) => ({
        uniqueId: person.uniqueId,
        name: person.name || "",
      })),
    });
  } catch (error) {
    console.error("Outlet salesperson fetch error:", error);

    return NextResponse.json(
      { error: "Unable to fetch salespersons." },
      { status: 500 }
    );
  }
}