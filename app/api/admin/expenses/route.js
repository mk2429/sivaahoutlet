
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import connectDB from "../../../../lib/db";
import { verifyAdminToken } from "../../../../lib/admin-auth";
import OutletTransaction from "../../../models/OutletTransaction";
import Sale from "../../../models/Sale";

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
const METHODS = ["Cash", "UPI", "Bank Transfer", "Card", "Other"];
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
  return NextResponse.json({ success: false, message }, { status });
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

  const suffix = endOfDay ? "T23:59:59.999+05:30" : "T00:00:00.000+05:30";
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

// Cash collections go to Cash. Every non-cash collection goes to Bank.
function methodToAccount(method) {
  return String(method || "").toLowerCase() === "cash" ? "Cash" : "Bank";
}

// Read split payments when available; otherwise use the bill's payment method.
// Collections are sourced from Sale records only, never from the manual ledger.
function getSaleCollections(sale) {
  const paid = Math.max(0, num(sale.amountPaid));
  const summary = Array.isArray(sale.paymentSummary)
    ? sale.paymentSummary
    : [];

  const validSummary = summary
    .map((entry) => ({
      method: entry.method || sale.paymentMethod || "Other",
      amount: Math.max(0, num(entry.amount)),
    }))
    .filter((entry) => entry.amount > 0);

  if (validSummary.length > 0) {
    const summaryTotal = sum(validSummary, (entry) => entry.amount);

    // If the payment breakdown matches the paid amount, use it directly.
    if (Math.abs(summaryTotal - paid) < 0.02) {
      return validSummary.map((entry) => ({
        ...entry,
        account: methodToAccount(entry.method),
      }));
    }

    // A partial or inconsistent summary must not create extra collections.
    // Preserve the known payment methods, but cap the total at amountPaid.
    let remaining = paid;
    const allocations = [];

    for (const entry of validSummary) {
      if (remaining <= 0) break;

      const allocated = Math.min(entry.amount, remaining);
      if (allocated > 0) {
        allocations.push({
          method: entry.method,
          amount: allocated,
          account: methodToAccount(entry.method),
        });
        remaining -= allocated;
      }
    }

    if (remaining > 0) {
      allocations.push({
        method: sale.paymentMethod || "Other",
        amount: remaining,
        account: methodToAccount(sale.paymentMethod),
      });
    }

    return allocations;
  }

  if (paid <= 0) return [];

  return [
    {
      method: sale.paymentMethod || "Other",
      amount: paid,
      account: methodToAccount(sale.paymentMethod),
    },
  ];
}

function collectionTotals(sales) {
  const result = {
    Cash: 0,
    Bank: 0,
    total: 0,
  };

  for (const sale of sales) {
    for (const collection of getSaleCollections(sale)) {
      result[collection.account] += collection.amount;
      result.total += collection.amount;
    }
  }

  return result;
}

function calculateManualAccountBalances(transactions) {
  const balances = { Cash: 0, Bank: 0 };

  for (const transaction of transactions) {
    const amount = num(transaction.amount);
    const account = ACCOUNTS.includes(transaction.account)
      ? transaction.account
      : null;

    if (!account) continue;

    if (transaction.type === "transfer") {
      balances[account] -= amount;

      if (ACCOUNTS.includes(transaction.transferToAccount)) {
        balances[transaction.transferToAccount] += amount;
      }

      continue;
    }

    balances[account] += transaction.direction === "in" ? amount : -amount;
  }

  return balances;
}

export async function GET(request) {
  if (!(await authorize())) return errorResponse("Unauthorized", 401);

  try {
    await connectDB();

    const { searchParams } = new URL(request.url);
    const fromText = searchParams.get("from") || "";
    const toText = searchParams.get("to") || "";

    const from = parseDate(fromText);
    const to = parseDate(toText, true);

    if (fromText && !from) return errorResponse("Invalid start date");
    if (toText && !to) return errorResponse("Invalid end date");
    if (from && to && from > to) {
      return errorResponse("Start date cannot be after end date");
    }

    const periodTransactionFilter = {
      ...buildDateFilter(from, to, "transactionDate"),
      isVoided: false,
    };

    const periodSaleFilter = {
      ...buildDateFilter(from, to, "createdAt"),
      status: "completed",
    };

    // Period data powers the selected-date report.
    // Lifetime data powers current Cash and Bank balances.
    const [
      periodTransactions,
      periodSales,
      allTransactions,
      allSales,
    ] = await Promise.all([
      OutletTransaction.find(periodTransactionFilter)
        .sort({ transactionDate: -1, createdAt: -1 })
        .lean(),
      Sale.find(periodSaleFilter).lean(),
      OutletTransaction.find({ isVoided: false }).lean(),
      Sale.find({ status: "completed" }).lean(),
    ]);

    const periodCollections = collectionTotals(periodSales);
    const lifetimeCollections = collectionTotals(allSales);

    const manualBalances = calculateManualAccountBalances(allTransactions);

    // Actual balances = all recorded manual movements + all recorded sales
    // collections. These are only reliable if opening balances and old
    // transactions have been entered correctly.
    const accountBalances = ACCOUNTS.map((account) => ({
      account,
      salesCollections: lifetimeCollections[account],
      manualNetMovement: manualBalances[account],
      balance: lifetimeCollections[account] + manualBalances[account],
    }));

    const expenses = sum(
      periodTransactions.filter((t) => t.profitTreatment === "expense"),
      (t) => t.amount
    );

    const capitalAdded = sum(
      periodTransactions.filter((t) => t.type === "capital_contribution"),
      (t) => t.amount
    );

    const founderLoans = sum(
      periodTransactions.filter((t) => t.type === "founder_loan"),
      (t) => t.amount
    );

    const founderWithdrawals = sum(
      periodTransactions.filter((t) => t.type === "founder_withdrawal"),
      (t) => t.amount
    );

    const inventoryPurchases = sum(
      periodTransactions.filter((t) => t.type === "inventory_purchase"),
      (t) => t.amount
    );

    const otherIncome = sum(
      periodTransactions.filter((t) => t.profitTreatment === "income"),
      (t) => t.amount
    );

    const refunds = sum(
      periodTransactions.filter((t) => t.type === "customer_refund"),
      (t) => t.amount
    );

    const billedSales = sum(periodSales, (sale) => sale.netAmount);
    const outstanding = sum(periodSales, (sale) => sale.balance);

    // A preliminary estimate only. It excludes labour and packaging unless
    // their reliable sale-time cost snapshots are available.
    let estimatedProductProfit = 0;
    let salesWithUnknownCost = 0;

    for (const sale of periodSales) {
      for (const item of sale.items || []) {
        const sellingPrice = num(item.finalPrice);
        const weight = num(item.weight);
        const silverRate = num(sale.silverRateAtSale);

        if (weight <= 0 || silverRate <= 0) {
          salesWithUnknownCost += 1;
          continue;
        }

        estimatedProductProfit += sellingPrice - weight * silverRate;
      }
    }

    const founderSummary = ["Mayank", "Krishna"].map((person) => ({
      person,
      capitalAdded: sum(
        periodTransactions.filter(
          (t) =>
            t.type === "capital_contribution" && t.person === person
        ),
        (t) => t.amount
      ),
      loansGiven: sum(
        periodTransactions.filter(
          (t) => t.type === "founder_loan" && t.person === person
        ),
        (t) => t.amount
      ),
      withdrawals: sum(
        periodTransactions.filter(
          (t) =>
            t.type === "founder_withdrawal" && t.person === person
        ),
        (t) => t.amount
      ),
    }));

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
        otherIncome,
        refunds,
        estimatedProductProfit,
        estimatedOperatingResult:
          estimatedProductProfit + otherIncome - expenses - refunds,
        salesWithUnknownCost,
      },
      accountBalances,
      founderSummary,
      sales: periodSales,
      transactions: periodTransactions,
      note:
        "Cash and Bank balances use all recorded history. Period sales collections are grouped by bill creation date because the current Sale schema does not store separate collection timestamps. Enter accurate opening balances and historical movements before relying on the balances.",
    });
  } catch (error) {
    console.error("Expenses GET error:", error);
    return errorResponse("Failed to load accounting data", 500);
  }
}

export async function POST(request) {
  if (!(await authorize())) return errorResponse("Unauthorized", 401);

  try {
    await connectDB();

    const body = await request.json();

    const {
      transactionDate,
      type,
      amount,
      category,
      description = "",
      person = "",
      paymentMethod,
      account,
      reference = "",
      transferToAccount = "",
    } = body;

    if (!TYPES[type]) return errorResponse("Invalid transaction type");

    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      return errorResponse("Amount must be greater than zero");
    }

    if (
      !transactionDate ||
      Number.isNaN(new Date(transactionDate).getTime())
    ) {
      return errorResponse("A valid transaction date is required");
    }

    if (!String(category || "").trim()) {
      return errorResponse("Category is required");
    }

    if (!PEOPLE.includes(person)) return errorResponse("Invalid person");
    if (!METHODS.includes(paymentMethod)) {
      return errorResponse("Invalid payment method");
    }

    if (!ACCOUNTS.includes(account)) {
      return errorResponse("Account must be Cash or Bank");
    }

    if (
      type === "transfer" &&
      (!ACCOUNTS.includes(transferToAccount) ||
        transferToAccount === account)
    ) {
      return errorResponse("Choose the other account as transfer destination");
    }

    if (
      type === "capital_contribution" &&
      !["Mayank", "Krishna"].includes(person)
    ) {
      return errorResponse("Select the founder who invested the money");
    }

    const config = TYPES[type];

    const transaction = await OutletTransaction.create({
      transactionDate: new Date(transactionDate),
      type,
      amount: value,
      category: String(category).trim(),
      description: String(description).trim(),
      person,
      paymentMethod,
      account,
      direction: config.direction,
      profitTreatment: config.treatment,
      reference: String(reference).trim(),
      transferToAccount: type === "transfer" ? transferToAccount : "",
    });

    return NextResponse.json(
      { success: true, transaction },
      { status: 201 }
    );
  } catch (error) {
    console.error("Expenses POST error:", error);
    return errorResponse("Failed to save transaction", 500);
  }
}

export async function DELETE(request) {
  if (!(await authorize())) return errorResponse("Unauthorized", 401);

  try {
    await connectDB();

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    const reason = searchParams.get("reason") || "Voided by admin";

    if (!id) return errorResponse("Transaction ID is required");

    const transaction = await OutletTransaction.findByIdAndUpdate(
      id,
      {
        $set: {
          isVoided: true,
          voidReason: String(reason).slice(0, 500),
        },
      },
      { new: true }
    );

    if (!transaction) return errorResponse("Transaction not found", 404);

    return NextResponse.json({ success: true, transaction });
  } catch (error) {
    console.error("Expenses DELETE error:", error);
    return errorResponse("Failed to void transaction", 500);
  }
}
