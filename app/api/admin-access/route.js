
import { NextResponse } from "next/server";
import { createAdminToken } from "@/lib/admin-auth";

export async function POST(request) {
  try {
    const { password } = await request.json();
    const adminPassword = process.env.ADMIN_PASSWORD;

    if (!adminPassword) {
      return NextResponse.json(
        { success: false, message: "Admin password is not configured." },
        { status: 500 }
      );
    }

    if (
      typeof password !== "string" ||
      password.length > 200 ||
      password !== adminPassword
    ) {
      return NextResponse.json(
        { success: false, message: "Incorrect password." },
        { status: 401 }
      );
    }

    const response = NextResponse.json({ success: true });

    response.cookies.set(
      "sivaah_admin_access",
      createAdminToken(adminPassword),
      {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        path: "/",
        maxAge: 8 * 60 * 60,
      }
    );

    return response;
  } catch {
    return NextResponse.json(
      { success: false, message: "Unable to verify password." },
      { status: 400 }
    );
  }
}
