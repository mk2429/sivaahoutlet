
export const PACKAGING_COST = 50;
export const MAX_DISCOUNT = 0.15;
export const TARGET_MARGIN = 0.25;

/**
 * Batch ID format:
 * DDMMYYYY + source silver rate (3 digits) + labour per gram (3 digits)
 */
export function decodeBatchId(value) {
  const batchId = String(value || "").trim();

  if (!/^\d{14}$/.test(batchId)) return null;

  const day = Number(batchId.slice(0, 2));
  const month = Number(batchId.slice(2, 4));
  const year = Number(batchId.slice(4, 8));
  const sourceSilverRate = Number(batchId.slice(8, 11));
  const labourPerGram = Number(batchId.slice(11, 14));

  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCDate() !== day ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCFullYear() !== year ||
    year < 2000 ||
    sourceSilverRate <= 0
  ) {
    return null;
  }

  return {
    batchId,
    batchDate: `${String(day).padStart(2, "0")}/${String(
      month
    ).padStart(2, "0")}/${year}`,
    sourceSilverRate,
    labourPerGram,
  };
}

/**
 * Existing Sivaah selling-price rounding:
 * Ending 00–49 -> previous hundred ending 99
 * Ending 50–99 -> current hundred ending 99
 */
export function roundSellingPrice(price) {
  if (!Number.isFinite(price) || price <= 0) return null;

  const hundred = Math.floor(price / 100) * 100;
  const lastTwoDigits = price - hundred;

  return lastTwoDigits < 50 ? hundred - 1 : hundred + 99;
}

/**
 * Single source of truth for piece-level pricing.
 * Returns null costs/prices if the weight or batch is invalid.
 */
export function calculatePiecePricing({
  weight,
  batch,
  currentSilverRate,
}) {
  const validWeight = Number.isFinite(Number(weight)) && Number(weight) > 0;
  const validRate =
    Number.isFinite(Number(currentSilverRate)) && Number(currentSilverRate) > 0;

  if (!validWeight || !batch || !validRate) {
    return {
      cpToday: null,
      cpSource: null,
      sp: null,
      spAfterDiscount: null,
      pricingStatus: !validWeight
        ? "Invalid piece weight"
        : !batch
          ? "Missing or invalid batch ID"
          : "Current silver rate is missing",
    };
  }

  const actualWeight = Number(weight);
  const currentRate = Number(currentSilverRate);

  const cpToday = Math.round(
    actualWeight * (currentRate + batch.labourPerGram) + PACKAGING_COST
  );

  const cpSource = Math.round(
    actualWeight *
      (batch.sourceSilverRate + batch.labourPerGram) +
      PACKAGING_COST
  );

  const calculatedSp =
    cpToday / ((1 - MAX_DISCOUNT) * (1 - TARGET_MARGIN));

  const sp = roundSellingPrice(calculatedSp);

  const spAfterDiscount =
    sp !== null ? Math.round(sp * (1 - MAX_DISCOUNT)) : null;

  return {
    cpToday,
    cpSource,
    sp,
    spAfterDiscount,
    pricingStatus: "Ready",
  };
}
