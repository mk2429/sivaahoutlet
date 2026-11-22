import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import crypto from "crypto";
import { verifyAdminToken } from "@/lib/admin-auth";

async function isAdmin() {
  try {
    const token = (await cookies()).get("sivaah_admin_access")?.value;
    return token ? Boolean(await verifyAdminToken(token)) : false;
  } catch {
    return false;
  }
}

export async function POST() {
  try {
    if (!(await isAdmin())) {
      return NextResponse.json(
        { success: false, message: "Unauthorized" },
        { status: 401 }
      );
    }

    const cloudName =
      process.env.CLOUDINARY_CLOUD_NAME ||
      process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME ||
      "dh61336lh";
    const apiKey = process.env.CLOUDINARY_API_KEY;
    const apiSecret = process.env.CLOUDINARY_API_SECRET;

    if (!apiKey || !apiSecret) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Missing CLOUDINARY_API_KEY or CLOUDINARY_API_SECRET in .env",
        },
        { status: 500 }
      );
    }

    const timestamp = Math.round(Date.now() / 1000);
    const folder = "sivaah-custom-products";

    // Cloudinary requires parameters sorted alphabetically before appending apiSecret
    const stringToSign = `folder=${folder}&timestamp=${timestamp}${apiSecret}`;
    const signature = crypto
      .createHash("sha1")
      .update(stringToSign)
      .digest("hex");

    return NextResponse.json({
      success: true,
      cloudName,
      apiKey,
      timestamp,
      folder,
      signature,
    });
  } catch (error) {
    console.error("Cloudinary signature error:", error);
    return NextResponse.json(
      { success: false, message: "Could not initialize Cloudinary upload." },
      { status: 500 }
    );
  }
}