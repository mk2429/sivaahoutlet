
import { NextResponse } from "next/server";

export async function POST(request) {
  const response = NextResponse.redirect(new URL("/", request.url));

  response.cookies.set("sivaah_admin_access", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });

  return response;
}
