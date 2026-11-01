
import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import connectDB from "../../../../lib/db";
import { verifyAdminToken } from "../../../../lib/admin-auth";
import OutletOpeningBalance from "../../../models/OutletOpeningBalance";

const CUTOVER_DATE = new Date("2026-10-27T00:00:00.000+05:30");

async function isAuthorized() {
  const cookieStore = await cookies();
  const token = cookieStore.get("sivaah_admin_access")?.value;

  return Boolean(token && verifyAdminToken(token));
}

function error(message, status = 400) {
  return NextResponse.json(
    { success: false, message },
    { status }
  );
}

function toPaise(value, field) {
  const amount = Number(value);

  if (
    !Number.isFinite(amount) ||
    amount < 0 ||
    !Number.isSafeInteger(Math.round(amount * 100)) ||
    Math.abs(amount * 100 - Math.round(amount * 100)) > 1e-7
  ) {
    throw new Error(`${field} must be a valid non-negative amount with up to 2 decimals.`);
  }

  return Math.round(amount * 100);
}

function validateBody(body) {
  const requiredAmounts = [
    "cash",
    "bank",
    "supplierDues",
    "gstPayable",
    "customerAdvances",
  ];

  const result = {};

  for (const field of requiredAmounts) {
    if (body[field] === undefined || body[field] === null || body[field] === "") {
      throw new Error(`${field} is required.`);
    }
  }

  result.cashPaise = toPaise(body.cash, "Cash");
  result.bankPaise = toPaise(body.bank, "Bank");
  result.supplierDuesPaise = toPaise(body.supplierDues, "Supplier dues");
  result.gstPayablePaise = toPaise(body.gstPayable, "GST payable");
  result.customerAdvancesPaise = toPaise(body.customerAdvances, "Customer advances");

  const grams = Number(body.physicalSilverGrams);

  if (!Number.isFinite(grams) || grams < 0) {
    throw new Error("Physical silver grams must be a non-negative number.");
  }

  result.physicalSilverGrams = grams;
  result.silverCountVerified = body.silverCountVerified === true;

  if (!Array.isArray(body.founders)) {
    throw new Error("Founders must be provided as an array.");
  }

  result.founders = body.founders.map((founder) => ({
    founder: founder.founder,
    capitalContributed: toPaise(
      founder.capitalContributed ?? 0,
      `${founder.founder} capital contributed`
    ) / 100,
    capitalReturned: toPaise(
      founder.capitalReturned ?? 0,
      `${founder.founder} capital returned`
    ) / 100,
    loanOutstanding: toPaise(
      founder.loanOutstanding ?? 0,
      `${founder.founder} loan outstanding`
    ) / 100,
    notes: String(founder.notes || "").trim(),
  }));

  result.verificationNotes = String(body.verificationNotes || "").trim();
  result.sourceReferences = Array.isArray(body.sourceReferences)
    ? body.sourceReferences.map(String).slice(0, 30)
    : [];

  return result;
}

function toClient(record) {
  if (!record) return null;

  const obj = record.toObject ? record.toObject() : record;

  return {
    ...obj,
    cash: obj.cashPaise / 100,
    bank: obj.bankPaise / 100,
    supplierDues: obj.supplierDuesPaise / 100,
    gstPayable: obj.gstPayablePaise / 100,
    customerAdvances: obj.customerAdvancesPaise / 100,
    founders: (obj.founders || []).map((f) => ({
      ...f,
      capitalContributed: f.capitalContributed,
      capitalReturned: f.capitalReturned,
      loanOutstanding: f.loanOutstanding,
    })),
  };
}

// GET: retrieve the opening balance snapshot.
export async function GET() {
  if (!(await isAuthorized())) {
    return error("Unauthorized", 401);
  }

  try {
    await connectDB();

    const record = await OutletOpeningBalance.findOne({
      effectiveDate: CUTOVER_DATE,
    }).lean();

    return NextResponse.json({
      success: true,
      openingBalance: toClient(record),
      booksStartDate: "2026-10-27",
      status: record?.verified ? "verified" : record ? "draft" : "not_started",
    });
  } catch (err) {
    console.error("Opening balance GET error:", err);
    return error("Unable to load opening balances", 500);
  }
}

// POST: create or edit a draft. Verified snapshots cannot be overwritten.
export async function POST(request) {
  if (!(await isAuthorized())) {
    return error("Unauthorized", 401);
  }

  try {
    await connectDB();

    const body = await request.json();
    const values = validateBody(body);

    const existing = await OutletOpeningBalance.findOne({
      effectiveDate: CUTOVER_DATE,
    });

    if (existing?.verified) {
      return error(
        "Opening balances are verified and cannot be overwritten. A separate audited correction workflow is required.",
        409
      );
    }

    const cookieStore = await cookies();
    const createdBy = "Admin";

    const record = existing || new OutletOpeningBalance({
      effectiveDate: CUTOVER_DATE,
      createdBy,
      verified: false,
      verifiedAt: null,
      verifiedBy: "",
    });

    Object.assign(record, values);
    record.verified = false;
    record.verifiedAt = null;
    record.verifiedBy = "";

    await record.save();

    return NextResponse.json({
      success: true,
      status: "draft",
      openingBalance: toClient(record),
    });
  } catch (err) {
    if (err.code === 11000) {
      return error(
        "An opening balance record already exists. Reload and try again.",
        409
      );
    }

    if (err.name === "ValidationError" || err.message?.includes("must be")) {
      return error(err.message, 400);
    }

    console.error("Opening balance POST error:", err);
    return error("Unable to save opening balances", 500);
  }
}

// PATCH: verify the draft after the owner checks all figures.
export async function PATCH(request) {
  if (!(await isAuthorized())) {
    return error("Unauthorized", 401);
  }

  try {
    await connectDB();

    const body = await request.json();

    if (body.action !== "verify") {
      return error("Only the verify action is supported.");
    }

    const record = await OutletOpeningBalance.findOne({
      effectiveDate: CUTOVER_DATE,
    });

    if (!record) {
      return error("Save an opening balance draft before verifying it.");
    }

    if (record.verified) {
      return error("Opening balances are already verified.", 409);
    }

    if (!record.silverCountVerified) {
      return error(
        "Confirm the physical silver count before verifying opening balances."
      );
    }

    if (!String(body.confirmation || "").trim()) {
      return error(
        "Enter a confirmation message to verify these balances."
      );
    }

    record.verified = true;
    record.verifiedBy = "Admin";
    record.verifiedAt = new Date();
    record.verificationNotes = [
      record.verificationNotes,
      `Verification confirmation: ${String(body.confirmation).trim()}`,
    ].filter(Boolean).join("\n");

    await record.save();

    return NextResponse.json({
      success: true,
      status: "verified",
      openingBalance: toClient(record),
    });
  } catch (err) {
    console.error("Opening balance PATCH error:", err);
    return error("Unable to verify opening balances", 500);
  }
}
