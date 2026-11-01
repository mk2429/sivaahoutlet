
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import connectDB from "../../../../lib/db";
import { verifyAdminToken } from "../../../../lib/admin-auth";
import OutletTransaction from "../../../models/OutletTransaction";
import Sale from "../../../models/Sale";

const BOOKS_START_DATE = new Date("2026-10-27T00:00:00.000+05:30");

const TYPES = {
  expense: { direction: "out", treatment: "expense" },
  capital_contribution: { direction: "in", treatment: "capital" },
  founder_loan: { direction: "in", treatment: "loan" },
  founder_withdrawal: { direction: "out", treatment: "withdrawal" },
  inventory_purchase: { direction: "out", treatment: "inventory" },
  supplier_payment: { direction: "out", treatment: "none" },
  other_income: { direction: "in", treatment: "income" },
  customer_refund: { direction: "out", treatment: "none" },
  other_outflow: { direction: "out", treatment: "none" },
  opening_balance: { direction: "in", treatment: "opening" },
  transfer: { direction: "out", treatment: "transfer" },
};

const ACCOUNTS = ["Cash", "Bank"];

const METHODS = [
  "Cash",
  "UPI",
  "Bank Transfer",
  "Card",
  "Other",
];

const PEOPLE = [
  "Mayank",
  "Krishna",
  "Shared",
  "Supplier",
  "Customer",
  "Other",
  "",
];

function errorResponse(message, status = 400) {
  return NextResponse.json(
    { success: false, message },
    { status }
  );
}

async function authorize() {
  const cookieStore = await cookies();
  const token = cookieStore.get("sivaah_admin_access")?.value;

  if (!token) return false;

  try {
    return Boolean(await verifyAdminToken(token));
  } catch {
    return false;
  }
}

function parseDate(value, endOfDay = false) {
  if (!value) return null;

  const suffix = endOfDay
    ? "T23:59:59.999+05:30"
    : "T00:00:00.000+05:30";

  const result = new Date(`${value}${suffix}`);

  return Number.isNaN(result.getTime()) ? null : result;
}

function buildDateFilter(from, to, field) {
  const filter = {};

  if (from || to) {
    filter[field] = {};

    if (from) filter[field].$gte = from;
    if (to) filter[field].$lte = to;
  }

  return filter;
}

const num = (value) => {
  const result = Number(value);
  return Number.isFinite(result) ? result : 0;
};

const sum = (items, getter) =>
  items.reduce((total, item) => total + num(getter(item)), 0);

function methodToAccount(method) {
  return String(method || "").toLowerCase() === "cash"
    ? "Cash"
    : "Bank";
}

function getSaleCollections(sale) {
  const paid = Math.max(0, num(sale.amountPaid));

  const summary = Array.isArray(sale.paymentSummary)
    ? sale.paymentSummary
    : [];

  const entries = summary
    .map((entry) => ({
      method: entry.method || sale.paymentMethod || "Other",
      amount: Math.max(0, num(entry.amount)),
    }))
    .filter((entry) => entry.amount > 0);

  if (paid <= 0) return [];

  if (entries.length === 0) {
    return [
      {
        method: sale.paymentMethod || "Other",
        amount: paid,
        account: methodToAccount(sale.paymentMethod),
      },
    ];
  }

  const result = [];
  let remainingPaise = Math.round(paid * 100);

  for (const entry of entries) {
    if (remainingPaise <= 0) break;

    const entryPaise = Math.round(entry.amount * 100);
    const allocatedPaise = Math.min(entryPaise, remainingPaise);

    if (allocatedPaise > 0) {
      result.push({
        method: entry.method,
        amount: allocatedPaise / 100,
        account: methodToAccount(entry.method),
      });

      remainingPaise -= allocatedPaise;
    }
  }

  if (remainingPaise > 0) {
    result.push({
      method: sale.paymentMethod || "Other",
      amount: remainingPaise / 100,
      account: methodToAccount(sale.paymentMethod),
    });
  }

  return result;
}

function collectionTotals(sales) {
  const totals = {
    Cash: 0,
    Bank: 0,
    total: 0,
  };

  for (const sale of sales) {
    for (const collection of getSaleCollections(sale)) {
      totals[collection.account] += collection.amount;
      totals.total += collection.amount;
    }
  }

  return totals;
}

function calculateManualAccountBalances(transactions) {
  const balances = {
    Cash: 0,
    Bank: 0,
  };

  for (const transaction of transactions) {
    const amount = num(transaction.amount);
    const account = transaction.account;

    if (!ACCOUNTS.includes(account)) continue;

    if (transaction.type === "transfer") {
      balances[account] -= amount;

      if (ACCOUNTS.includes(transaction.transferToAccount)) {
        balances[transaction.transferToAccount] += amount;
      }

      continue;
    }

    balances[account] +=
      transaction.direction === "in" ? amount : -amount;
  }

  return balances;
}

// ======================================================
// GET — FINANCIAL OVERVIEW + LEDGER DATA
// ======================================================

export async function GET(request) {
  if (!(await authorize())) {
    return errorResponse("Unauthorized", 401);
  }

  try {
    await connectDB();

    const { searchParams } = new URL(request.url);

    const fromText = searchParams.get("from") || "";
    const toText = searchParams.get("to") || "";

    const from = parseDate(fromText);
    const to = parseDate(toText, true);

    if (fromText && !from) {
      return errorResponse("Invalid start date");
    }

    if (toText && !to) {
      return errorResponse("Invalid end date");
    }

    if (from && to && from > to) {
      return errorResponse("Start date cannot be after end date");
    }

    const effectiveFrom =
      from && from > BOOKS_START_DATE
        ? from
        : BOOKS_START_DATE;

    const periodTransactionFilter = {
      ...buildDateFilter(
        effectiveFrom,
        to,
        "transactionDate"
      ),
      isVoided: false,
    };

    const periodSaleFilter = {
      ...buildDateFilter(
        effectiveFrom,
        to,
        "createdAt"
      ),
      status: "completed",
    };

    const [
      periodTransactions,
      periodSales,
      allTransactions,
      allSales,
    ] = await Promise.all([
      OutletTransaction.find(periodTransactionFilter)
        .sort({
          transactionDate: -1,
          createdAt: -1,
        })
        .lean(),

      Sale.find(periodSaleFilter).lean(),

      OutletTransaction.find({
        isVoided: false,
        transactionDate: {
          $gte: BOOKS_START_DATE,
        },
      }).lean(),

      Sale.find({
        status: "completed",
        createdAt: {
          $gte: BOOKS_START_DATE,
        },
      }).lean(),
    ]);

    const periodCollections = collectionTotals(periodSales);
    const lifetimeCollections = collectionTotals(allSales);

    const manualBalances =
      calculateManualAccountBalances(allTransactions);

    const accountBalances = ACCOUNTS.map((account) => ({
      account,
      salesCollections: lifetimeCollections[account],
      manualNetMovement: manualBalances[account],
      balance:
        lifetimeCollections[account] +
        manualBalances[account],
    }));

    const expenses = sum(
      periodTransactions.filter(
        (t) => t.profitTreatment === "expense"
      ),
      (t) => t.amount
    );

    const capitalAdded = sum(
      periodTransactions.filter(
        (t) => t.type === "capital_contribution"
      ),
      (t) => t.amount
    );

    const founderLoans = sum(
      periodTransactions.filter(
        (t) => t.type === "founder_loan"
      ),
      (t) => t.amount
    );

    const founderWithdrawals = sum(
      periodTransactions.filter(
        (t) => t.type === "founder_withdrawal"
      ),
      (t) => t.amount
    );

    const inventoryPurchases = sum(
      periodTransactions.filter(
        (t) => t.type === "inventory_purchase"
      ),
      (t) => t.amount
    );

    const supplierPayments = sum(
      periodTransactions.filter(
        (t) => t.type === "supplier_payment"
      ),
      (t) => t.amount
    );

    const otherIncome = sum(
      periodTransactions.filter(
        (t) => t.profitTreatment === "income"
      ),
      (t) => t.amount
    );

    const refunds = sum(
      periodTransactions.filter(
        (t) => t.type === "customer_refund"
      ),
      (t) => t.amount
    );

    const billedSales = sum(
      periodSales,
      (sale) => sale.netAmount
    );

    const outstanding = sum(
      periodSales,
      (sale) => sale.balance
    );

    // Profit uses permanent sale-time snapshots only.
    // Historical acquisition/source costs are not used.
    // GST is not deducted from profit.
    let estimatedProductProfit = 0;
    let salesWithUnknownCost = 0;

    for (const sale of periodSales) {
      for (const item of sale.items || []) {
        const hasProfitSnapshot =
          item.profitAtSale !== null &&
          item.profitAtSale !== undefined &&
          Number.isFinite(Number(item.profitAtSale));

        const hasCostSnapshot =
          item.costAtSale !== null &&
          item.costAtSale !== undefined &&
          Number.isFinite(Number(item.costAtSale));

        if (hasProfitSnapshot) {
          estimatedProductProfit += num(item.profitAtSale);
        } else if (hasCostSnapshot) {
          estimatedProductProfit +=
            num(item.finalPrice) - num(item.costAtSale);
        } else {
          salesWithUnknownCost += 1;
        }
      }
    }

    estimatedProductProfit =
      Math.round(estimatedProductProfit * 100) / 100;

    const founderSummary = ["Mayank", "Krishna"].map(
      (person) => ({
        person,

        capitalAdded: sum(
          periodTransactions.filter(
            (t) =>
              t.type === "capital_contribution" &&
              t.person === person
          ),
          (t) => t.amount
        ),

        loansGiven: sum(
          periodTransactions.filter(
            (t) =>
              t.type === "founder_loan" &&
              t.person === person
          ),
          (t) => t.amount
        ),

        withdrawals: sum(
          periodTransactions.filter(
            (t) =>
              t.type === "founder_withdrawal" &&
              t.person === person
          ),
          (t) => t.amount
        ),
      })
    );

    return NextResponse.json({
      success: true,

      summary: {
        billedSales,
        saleCollections: periodCollections.total,
        cashCollections: periodCollections.Cash,
        bankCollections: periodCollections.Bank,
        outstanding,
        expenses,
        capitalAdded,
        founderLoans,
        founderWithdrawals,
        inventoryPurchases,
        supplierPayments,
        otherIncome,
        refunds,
        estimatedProductProfit,

        estimatedOperatingResult:
          estimatedProductProfit +
          otherIncome -
          expenses -
          refunds,

        salesWithUnknownCost,
      },

      accountBalances,
      founderSummary,
      sales: periodSales,
      transactions: periodTransactions,

      booksStartDate: "2026-10-27",

      note:
        "Books begin on 27 October 2026. Sales collections are grouped by bill creation date because separate collection timestamps are not yet implemented. Verify opening balances before relying on Cash and Bank balances.",
    });
  } catch (error) {
    console.error("Expenses GET error:", error);

    return errorResponse(
      "Failed to load accounting data",
      500
    );
  }
}

// ======================================================
// POST — CREATE LEDGER TRANSACTION
// ======================================================

export async function POST(request) {
  if (!(await authorize())) {
    return errorResponse("Unauthorized", 401);
  }

  let postedIdempotencyKey = "";

  try {
    await connectDB();

    const body = await request.json();

    const {
      transactionDate,
      type,
      amount,
      idempotencyKey = "",
      category,
      description = "",
      person = "",
      paymentMethod,
      account,
      reference = "",
      transferToAccount = "",
    } = body;

    if (!TYPES[type]) {
      return errorResponse("Invalid transaction type");
    }

    const value = Number(amount);

    if (!Number.isFinite(value) || value <= 0) {
      return errorResponse("Amount must be greater than zero");
    }

    const amountPaise = Math.round(value * 100);

    if (
      !Number.isSafeInteger(amountPaise) ||
      Math.abs(value * 100 - amountPaise) > 1e-7
    ) {
      return errorResponse(
        "Amount must have no more than two decimal places"
      );
    }

    if (
      !transactionDate ||
      Number.isNaN(new Date(transactionDate).getTime())
    ) {
      return errorResponse("A valid transaction date is required");
    }

    const parsedTransactionDate = new Date(transactionDate);

    if (parsedTransactionDate < BOOKS_START_DATE) {
      return errorResponse(
        "Transaction date cannot be before 27 October 2026"
      );
    }

    const safeIdempotencyKey =
      String(idempotencyKey || "").trim();

    postedIdempotencyKey = safeIdempotencyKey;

    if (safeIdempotencyKey.length > 120) {
      return errorResponse("Idempotency key is too long");
    }

    if (safeIdempotencyKey) {
      const existing = await OutletTransaction.findOne({
        idempotencyKey: safeIdempotencyKey,
      }).lean();

      if (existing) {
        return NextResponse.json({
          success: true,
          transaction: existing,
          duplicate: true,
        });
      }
    }

    if (!String(category || "").trim()) {
      return errorResponse("Category is required");
    }

    if (!PEOPLE.includes(person)) {
      return errorResponse("Invalid person");
    }

    if (!METHODS.includes(paymentMethod)) {
      return errorResponse("Invalid payment method");
    }

    if (!ACCOUNTS.includes(account)) {
      return errorResponse("Account must be Cash or Bank");
    }

    if (
      type === "transfer" &&
      (
        !ACCOUNTS.includes(transferToAccount) ||
        transferToAccount === account
      )
    ) {
      return errorResponse(
        "Choose the other account as transfer destination"
      );
    }

    if (
      [
        "capital_contribution",
        "founder_loan",
        "founder_withdrawal",
      ].includes(type) &&
      !["Mayank", "Krishna"].includes(person)
    ) {
      return errorResponse(
        "Select Mayank or Krishna for this founder transaction"
      );
    }

    const config = TYPES[type];

    const transaction = await OutletTransaction.create({
      transactionDate: parsedTransactionDate,
      type,
      amount: amountPaise / 100,
      amountPaise,
      idempotencyKey: safeIdempotencyKey || undefined,
      category: String(category).trim(),
      description: String(description).trim(),
      person,
      paymentMethod,
      account,
      direction: config.direction,
      profitTreatment: config.treatment,
      reference: String(reference).trim(),
      transferToAccount:
        type === "transfer" ? transferToAccount : "",
    });

    return NextResponse.json(
      {
        success: true,
        transaction,
      },
      { status: 201 }
    );
  } catch (error) {
    if (error?.code === 11000 && postedIdempotencyKey) {
      const existing = await OutletTransaction.findOne({
        idempotencyKey: postedIdempotencyKey,
      }).lean();

      if (existing) {
        return NextResponse.json({
          success: true,
          transaction: existing,
          duplicate: true,
        });
      }
    }

    console.error("Expenses POST error:", error);

    return errorResponse(
      "Failed to save transaction",
      500
    );
  }
}

// ======================================================
// DELETE — VOID LEDGER TRANSACTION
// ======================================================

export async function DELETE(request) {
  if (!(await authorize())) {
    return errorResponse("Unauthorized", 401);
  }

  try {
    await connectDB();

    const { searchParams } = new URL(request.url);

    const id = searchParams.get("id");
    const reason = String(
      searchParams.get("reason") || ""
    ).trim();

    if (!id) {
      return errorResponse("Transaction ID is required");
    }

    if (!reason) {
      return errorResponse("A correction reason is required");
    }

    if (reason.length > 500) {
      return errorResponse("Reason cannot exceed 500 characters");
    }

    const current = await OutletTransaction.findById(id);

    if (!current) {
      return errorResponse("Transaction not found", 404);
    }

    if (current.isVoided) {
      return errorResponse(
        "Transaction is already voided",
        409
      );
    }

    current.isVoided = true;
    current.voidReason = reason;

    await current.save();

    return NextResponse.json({
      success: true,
      transaction: current,
    });
  } catch (error) {
    console.error("Expenses DELETE error:", error);

    return errorResponse(
      "Failed to void transaction",
      500
    );
  }
}
