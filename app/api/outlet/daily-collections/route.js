
import { NextResponse } from "next/server";
import connectDB from "../../../../lib/db";
import Sale from "../../../models/Sale";
import OutletTransaction from "../../../models/OutletTransaction";

const num = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const round2 = (value) => Math.round((value + Number.EPSILON) * 100) / 100;

function getISTDayRange() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const get = (type) => parts.find((p) => p.type === type)?.value;
  const date = `${get("year")}-${get("month")}-${get("day")}`;

  return {
    date,
    start: new Date(`${date}T00:00:00+05:30`),
    end: new Date(`${date}T23:59:59.999+05:30`),
  };
}

function getPayments(sale) {
  const paid = Math.max(0, num(sale.amountPaid));
  const summary = Array.isArray(sale.paymentSummary)
    ? sale.paymentSummary
    : [];

  const summaryTotal = summary.reduce(
    (sum, line) => sum + Math.max(0, num(line.amount)),
    0
  );

  // Use split-payment lines only when they reconcile with the bill's paid amount.
  if (summary.length && Math.abs(summaryTotal - paid) < 0.02) {
    return summary.map((line) => ({
      method: line.method,
      amount: Math.max(0, num(line.amount)),
    }));
  }

  if (paid <= 0) return [];

  // A Split payment without valid breakdown cannot safely be assigned to Cash/UPI.
  if (sale.paymentMethod === "Split") {
    return [{ method: "Unallocated", amount: paid }];
  }

  return [{ method: sale.paymentMethod || "Other", amount: paid }];
}

function formatTime(value) {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(value));
}

export async function GET() {
  try {
    await connectDB();

    const { date, start, end } = getISTDayRange();

    const [sales, transactions] = await Promise.all([
      Sale.find({
        status: "completed",
        createdAt: { $gte: start, $lte: end },
      })
        .sort({ createdAt: 1 })
        .lean(),

      OutletTransaction.find({
        isVoided: { $ne: true },
        transactionDate: { $gte: start, $lte: end },
      })
        .sort({ transactionDate: 1, createdAt: 1 })
        .lean(),
    ]);

    let grossSales = 0;
    let discounts = 0;
    let netSales = 0;
    let totalCollected = 0;
    let outstanding = 0;

    const payments = {
      cash: 0,
      upi: 0,
      card: 0,
      bankTransfer: 0,
      otherPayments: 0,
      unallocated: 0,
    };

    const salespersonMap = new Map();
    const productMap = new Map();
    const bills = [];

    for (const sale of sales) {
      grossSales += num(sale.grossAmount);
      discounts += num(sale.discountAmount);
      netSales += num(sale.netAmount);
      totalCollected += num(sale.amountPaid);
      outstanding += num(sale.balance);

      for (const payment of getPayments(sale)) {
        const amount = payment.amount;

        switch (payment.method) {
          case "Cash":
            payments.cash += amount;
            break;
          case "UPI":
            payments.upi += amount;
            break;
          case "Card":
            payments.card += amount;
            break;
          case "Bank Transfer":
            payments.bankTransfer += amount;
            break;
          case "Unallocated":
            payments.unallocated += amount;
            break;
          default:
            payments.otherPayments += amount;
        }
      }

      const salespersonName = sale.salespersonName || "Unassigned";
      const person = salespersonMap.get(salespersonName) || {
        name: salespersonName,
        totalCollected: 0,
        billCount: 0,
      };

      person.totalCollected += num(sale.amountPaid);
      person.billCount += 1;
      salespersonMap.set(salespersonName, person);

      const items = Array.isArray(sale.items) ? sale.items : [];

      for (const item of items) {
        const key = `${item.name || "Silver Jewellery"}::${item.sku || ""}`;
        const product = productMap.get(key) || {
          name: item.name || "Silver Jewellery",
          sku: item.sku || "",
          quantity: 0,
          weight: 0,
          amount: 0,
        };

        product.quantity += 1;
        product.weight += num(item.weight);
        product.amount += num(item.finalPrice);
        productMap.set(key, product);
      }

      const paymentSummary = getPayments(sale)
        .map((p) => `${p.method}: ₹${round2(p.amount)}`)
        .join(", ") || "Unpaid";

      bills.push({
        billNumber: sale.billNumber || "—",
        time: formatTime(sale.createdAt),
        customerName: sale.customerSnapshot?.name || "Walk-in Customer",
        salespersonName,
        netAmount: num(sale.netAmount),
        amountPaid: num(sale.amountPaid),
        balance: num(sale.balance),
        paymentSummary,
        items: items.map((item) => ({
          name: item.name || "Silver Jewellery",
          sku: item.sku || "",
          quantity: 1,
          weight: num(item.weight),
          price: num(item.finalPrice),
        })),
      });
    }

    let expenses = 0;
    let otherIncome = 0;
    let refunds = 0;
    let otherOutflows = 0;
    let inventoryPurchases = 0;
    let supplierPayments = 0;
    let capitalContributions = 0;
    let founderLoans = 0;
    let founderWithdrawals = 0;

    let bankInflow = 0;
    let bankOutflow = 0;
    let bankTransferIn = 0;
    let bankTransferOut = 0;

    const transactionDetails = [];

    for (const tx of transactions) {
      const amount = num(tx.amount);
      const type = tx.type;
      const account = tx.account;
      const destination = tx.transferToAccount;

      if (type === "expense") expenses += amount;
      if (type === "other_income") otherIncome += amount;
      if (type === "customer_refund") refunds += amount;
      if (type === "other_outflow") otherOutflows += amount;
      if (type === "inventory_purchase") inventoryPurchases += amount;
      if (type === "supplier_payment") supplierPayments += amount;
      if (type === "capital_contribution") capitalContributions += amount;
      if (type === "founder_loan") founderLoans += amount;
      if (type === "founder_withdrawal") founderWithdrawals += amount;

      if (type === "transfer") {
        if (account === "Bank") bankTransferOut += amount;
        if (destination === "Bank") bankTransferIn += amount;
      } else {
        if (account === "Bank" && tx.direction === "in") {
          bankInflow += amount;
        }
        if (account === "Bank" && tx.direction === "out") {
          bankOutflow += amount;
        }
      }

      transactionDetails.push({
        time: formatTime(tx.transactionDate),
        type,
        category: tx.category || "Uncategorised",
        description: tx.description || "",
        amount,
        account,
        destination: type === "transfer" ? destination || "" : "",
        direction: tx.direction,
        paymentMethod: tx.paymentMethod,
        person: tx.person || "",
      });
    }

    const totalCollectedRounded = round2(totalCollected);
    const expensesRounded = round2(expenses);

    return NextResponse.json({
      success: true,
      report: {
        date,
        billCount: sales.length,
        grossSales: round2(grossSales),
        discounts: round2(discounts),
        netSales: round2(netSales),

        cash: round2(payments.cash),
        upi: round2(payments.upi),
        card: round2(payments.card),
        bankTransfer: round2(payments.bankTransfer),
        otherPayments: round2(payments.otherPayments),
        unallocatedPayments: round2(payments.unallocated),

        totalCollected: totalCollectedRounded,
        outstanding: round2(outstanding),

        salespersons: Array.from(salespersonMap.values()).map((person) => ({
          ...person,
          totalCollected: round2(person.totalCollected),
        })),

        products: Array.from(productMap.values()).map((product) => ({
          ...product,
          weight: round2(product.weight),
          amount: round2(product.amount),
        })),

        bills,

        expenses: expensesRounded,
        otherIncome: round2(otherIncome),
        refunds: round2(refunds),
        otherOutflows: round2(otherOutflows),
        inventoryPurchases: round2(inventoryPurchases),
        supplierPayments: round2(supplierPayments),
        capitalContributions: round2(capitalContributions),
        founderLoans: round2(founderLoans),
        founderWithdrawals: round2(founderWithdrawals),

        // Bank movements are based on explicitly recorded transactions,
        // not inferred from the payment method on a sales bill.
        bankInflow: round2(bankInflow),
        bankOutflow: round2(bankOutflow),
        bankTransferIn: round2(bankTransferIn),
        bankTransferOut: round2(bankTransferOut),
        bankNetMovement: round2(
          bankInflow - bankOutflow + bankTransferIn - bankTransferOut
        ),

        // This is a simple operational indicator, not a bank reconciliation.
        netCashMovement: round2(totalCollectedRounded - expensesRounded),

        transactions: transactionDetails,
      },
    });
  } catch (error) {
    console.error("Daily collections API error:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Unable to generate daily collection report.",
      },
      { status: 500 }
    );
  }
}
