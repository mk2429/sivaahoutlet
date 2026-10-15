
import { createHmac, timingSafeEqual } from "node:crypto";

export function createAdminToken(password) {
  return createHmac("sha256", password)
    .update("sivaah-admin-session")
    .digest("hex");
}

export function verifyAdminToken(token) {
  const password = process.env.ADMIN_PASSWORD;

  if (!password || typeof token !== "string") return false;

  const expected = Buffer.from(createAdminToken(password));
  const received = Buffer.from(token);

  return (
    expected.length === received.length &&
    timingSafeEqual(expected, received)
  );
}
