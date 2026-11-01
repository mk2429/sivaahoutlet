
"use client";

import { useCallback, useEffect, useState } from "react";

const TYPES = [
  { value: "expense", label: "Business Expense" },
  { value: "capital_contribution", label: "Founder Investment" },
  { value: "founder_loan", label: "Founder Loan to Business" },
  { value: "founder_withdrawal", label: "Founder Withdrawal" },
  { value: "inventory_purchase", label: "Inventory Purchase" },
  { value: "supplier_payment", label: "Supplier Payment" },
  { value: "other_income", label: "Other Income" },
  { value: "customer_refund", label: "Customer Refund" },
  { value: "other_outflow", label: "Other Outflow" },
  { value: "opening_balance", label: "Opening Balance" },
  { value: "transfer", label: "Cash / Bank Transfer" },
];

const PEOPLE = ["Mayank", "Krishna", "Shared", "Supplier", "Customer", "Other"];
const ACCOUNTS = ["Cash", "Bank"];
const METHODS = ["Cash", "UPI", "Bank Transfer", "Card", "Other"];

const CATEGORIES = {
  expense: [
    "Rent", "Salary", "Packaging", "Shipping", "Marketing",
    "Influencer", "Website", "Electricity", "Travel", "Repair",
    "Office Supplies", "Food", "Other",
  ],
  capital_contribution: ["Founder Capital"],
  founder_loan: ["Founder Loan"],
  founder_withdrawal: ["Personal Withdrawal"],
  inventory_purchase: ["Silver Jewellery Stock", "Raw Silver", "Other Stock"],
  supplier_payment: ["Supplier Payment"],
  other_income: ["Other Income"],
  customer_refund: ["Customer Refund"],
  other_outflow: ["Other Outflow"],
  opening_balance: ["Opening Cash/Bank Balance"],
  transfer: ["Account Transfer"],
};

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const firstDay = () => `${today().slice(0, 7)}-01`;

const money = (value) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(Number(value) || 0);

const dateText = (value) =>
  value
    ? new Date(value).toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "—";

const initialForm = () => ({
  transactionDate: today(),
  type: "expense",
  amount: "",
  category: "Rent",
  description: "",
  person: "Shared",
  paymentMethod: "Cash",
  account: "Cash",
  reference: "",
  transferToAccount: "Bank",
});

const cardStyle = {
  background: "var(--card, #fff)",
  border: "1px solid var(--border, #e5e7eb)",
  borderRadius: 12,
  padding: 16,
  minWidth: 0,
};

const inputStyle = {
  width: "100%",
  boxSizing: "border-box",
  padding: "10px 11px",
  border: "1px solid #d1d5db",
  borderRadius: 8,
  fontSize: 14,
  background: "var(--input-bg, #fff)",
  color: "var(--foreground, #111827)",
};

const labelStyle = {
  display: "block",
  fontSize: 12,
  fontWeight: 600,
  marginBottom: 6,
};

function Metric({ label, value, note, color }) {
  return (
    <div style={cardStyle}>
      <div style={{ color: "#6b7280", fontSize: 12 }}>{label}</div>
      <div
        style={{
          fontSize: 22,
          fontWeight: 750,
          marginTop: 8,
          color: color || "inherit",
          overflowWrap: "anywhere",
        }}
      >
        {money(value)}
      </div>
      {note && (
        <div style={{ color: "#6b7280", fontSize: 11, marginTop: 6 }}>
          {note}
        </div>
      )}
    </div>
  );
}

export default function Expenses() {
  const [from, setFrom] = useState(firstDay());
  const [to, setTo] = useState(today());
  const [data, setData] = useState(null);
  const [form, setForm] = useState(initialForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [activeTab, setActiveTab] = useState("overview");

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const params = new URLSearchParams();
      if (from) params.set("from", from);
      if (to) params.set("to", to);

      const response = await fetch(`/api/admin/expenses?${params}`, {
        credentials: "same-origin",
        cache: "no-store",
      });

      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.message || "Unable to load accounting data");
      }

      setData(result);
        } catch (err) {
      // Never display figures from the previous date range
      // when the latest request has failed.
      setData(null);
      setError(err.message || "Unable to load accounting data");
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const updateForm = (key, value) => {
    setForm((previous) => {
      const next = { ...previous, [key]: value };

      if (key === "type") {
        next.category = CATEGORIES[value]?.[0] || "Other";
        if (value === "transfer") {
          next.account = "Cash";
          next.transferToAccount = "Bank";
        }
      }

      if (key === "account" && next.transferToAccount === value) {
        next.transferToAccount = value === "Cash" ? "Bank" : "Cash";
      }

      // Cash payment normally moves Cash; all digital methods move Bank.
      if (key === "paymentMethod") {
        next.account = value === "Cash" ? "Cash" : "Bank";
      }

      return next;
    });
  };

  
const saveTransaction = async (event) => {
  event.preventDefault();

  if (saving) return;

  setSaving(true);
  setError("");
  setMessage("");

  try {
    // Keep the same key if this exact submission is retried.
    const idempotencyKey = crypto.randomUUID();

    const payload = {
      ...form,
      amount: Number(form.amount),
      transactionDate: new Date(
        `${form.transactionDate}T12:00:00`
      ).toISOString(),
      idempotencyKey,
    };

    const response = await fetch("/api/admin/expenses", {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(
        result.message || "Unable to save transaction"
      );
    }

    setMessage(
      result.duplicate
        ? "This transaction was already recorded."
        : "Transaction recorded successfully."
    );

    setForm(initialForm());
    await loadData();
  } catch (err) {
    setError(err.message || "Unable to save transaction");
  } finally {
    setSaving(false);
  }
};


  const voidTransaction = async (transaction) => {
    const reason = window.prompt(
      `Why are you voiding "${transaction.category}"?`,
      "Incorrect entry"
    );
    if (reason === null) return;

    if (!window.confirm("Void this transaction?")) return;

    try {
      const params = new URLSearchParams({
        id: transaction._id,
        reason,
      });

      const response = await fetch(`/api/admin/expenses?${params}`, {
        method: "DELETE",
        credentials: "same-origin",
      });

      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.message || "Unable to void transaction");
      }

      setMessage("Transaction voided.");
      await loadData();
    } catch (err) {
      setError(err.message || "Unable to void transaction");
    }
  };

  const summary = data?.summary || {};
  const transactions = data?.transactions || [];
  const founders = data?.founderSummary || [];
  const accounts = data?.accountBalances || [];

  const filteredTransactions = transactions.filter((transaction) => {
    const matchesType =
      typeFilter === "all" || transaction.type === typeFilter;

    const text = [
      transaction.category,
      transaction.description,
      transaction.person,
      transaction.reference,
      transaction.paymentMethod,
      transaction.account,
    ].join(" ").toLowerCase();

    return matchesType && text.includes(search.toLowerCase());
  });

  const tabs = [
    ["overview", "Overview"],
    ["transactions", "Ledger"],
    ["add", "Add Transaction"],
    ["founders", "Founder Accounts"],
  ];

  return (
    <div style={{ padding: "20px 0", color: "var(--foreground, #111827)" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 12,
          flexWrap: "wrap",
          marginBottom: 20,
        }}
      >
        <div>
          <h1 style={{ fontSize: 25, margin: 0 }}>Accounts & Expenses</h1>
          <p style={{ color: "#6b7280", fontSize: 13, marginTop: 6 }}>
            Sivaah cash, bank, founder funding and expense tracking.
          </p>
        </div>

        <button
          type="button"
          onClick={loadData}
          disabled={loading}
          style={{
            padding: "10px 14px",
            borderRadius: 8,
            border: "1px solid #d1d5db",
            background: "#fff",
            cursor: "pointer",
          }}
        >
          {loading ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      <div
        style={{
          ...cardStyle,
          display: "flex",
          flexWrap: "wrap",
          gap: 12,
          alignItems: "end",
          marginBottom: 18,
        }}
      >
        <div style={{ minWidth: 150, flex: 1 }}>
          <label style={labelStyle}>Report from</label>
          <input
            type="date"
            value={from}
            max={to || undefined}
            onChange={(e) => setFrom(e.target.value)}
            style={inputStyle}
          />
        </div>

        <div style={{ minWidth: 150, flex: 1 }}>
          <label style={labelStyle}>Report to</label>
          <input
            type="date"
            value={to}
            min={from || undefined}
            max={today()}
            onChange={(e) => setTo(e.target.value)}
            style={inputStyle}
          />
        </div>

        <button
          type="button"
          onClick={() => {
            setFrom(firstDay());
            setTo(today());
          }}
          style={{
            padding: "10px 14px",
            borderRadius: 8,
            border: "1px solid #d1d5db",
            background: "#fff",
            cursor: "pointer",
          }}
        >
          This month
        </button>

        <button
          type="button"
          onClick={() => {
            setFrom("");
            setTo("");
          }}
          style={{
            padding: "10px 14px",
            borderRadius: 8,
            border: "1px solid #d1d5db",
            background: "#fff",
            cursor: "pointer",
          }}
        >
          All dates
        </button>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 20 }}>
        {tabs.map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setActiveTab(value)}
            style={{
              padding: "10px 15px",
              borderRadius: 8,
              border: "1px solid",
              borderColor: activeTab === value ? "#111827" : "#d1d5db",
              background: activeTab === value ? "#111827" : "#fff",
              color: activeTab === value ? "#fff" : "#111827",
              cursor: "pointer",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {error && (
        <div
          role="alert"
          style={{
            background: "#fef2f2",
            color: "#991b1b",
            padding: 12,
            borderRadius: 8,
            marginBottom: 14,
          }}
        >
          {error}
        </div>
      )}

      {message && (
        <div
          role="status"
          style={{
            background: "#f0fdf4",
            color: "#166534",
            padding: 12,
            borderRadius: 8,
            marginBottom: 14,
          }}
        >
          {message}
        </div>
      )}

      {loading && !data ? (
        <div style={cardStyle}>Loading accounting records...</div>
      ) : (
        <>
          {activeTab === "overview" && (
            <>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
                  gap: 12,
                  marginBottom: 18,
                }}
              >
                <Metric
                  label="Cash in Hand"
                  value={accounts.find((a) => a.account === "Cash")?.balance}
                  note="All recorded history"
                />
                <Metric
                  label="Bank Balance"
                  value={accounts.find((a) => a.account === "Bank")?.balance}
                  note="Includes UPI, card and bank-transfer collections"
                />
                <Metric
                  label="Sales Billed"
                  value={summary.billedSales}
                  note="Selected date range"
                />
                <Metric
                  label="Sales Money In"
                  value={summary.saleCollections}
                  note="Actual recorded collections"
                />
                <Metric
                  label="Cash Sales Collections"
                  value={summary.cashCollections}
                />
                <Metric
                  label="Bank Sales Collections"
                  value={summary.bankCollections}
                />
                <Metric
                  label="Customer Outstanding"
                  value={summary.outstanding}
                  note="Unpaid amount on selected bills"
                />
                <Metric
                  label="Business Expenses"
                  value={summary.expenses}
                  color="#b91c1c"
                />
                <Metric
                  label="Founder Investments"
                  value={summary.capitalAdded}
                  note="Funding, not revenue"
                />
                <Metric
                  label="Founder Loans"
                  value={summary.founderLoans}
                  note="Payable back to founders"
                />
                <Metric
                  label="Inventory Purchases"
                  value={summary.inventoryPurchases}
                  note="Cash outflow; not automatically an expense"
                />
                <Metric
                  label="Founder Withdrawals"
                  value={summary.founderWithdrawals}
                  note="Not automatically an expense"
                />
                <Metric
                  label="Estimated Product Profit"
                  value={summary.estimatedProductProfit}
                  note="Incomplete cost estimate"
                  color={summary.estimatedProductProfit < 0 ? "#b91c1c" : "#166534"}
                />
                <Metric
                  label="Estimated Operating Result"
                  value={summary.estimatedOperatingResult}
                  note="Not final net profit"
                  color={summary.estimatedOperatingResult < 0 ? "#b91c1c" : "#166534"}
                />
              </div>

              <div style={{ ...cardStyle, marginBottom: 16 }}>
                <h3 style={{ marginTop: 0 }}>Cash & Bank Reconciliation</h3>
                <p style={{ color: "#6b7280", fontSize: 12 }}>
                  Balances include all recorded sales collections and manual
                  transactions across all dates. Opening balances and historical
                  entries must be complete for these figures to match reality.
                </p>

                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 480 }}>
                    <thead>
                      <tr>
                        {["Account", "Sales Money In", "Manual Net Movement", "Calculated Balance"].map((heading) => (
                          <th key={heading} style={{ textAlign: "left", padding: 10, borderBottom: "1px solid #e5e7eb" }}>
                            {heading}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {accounts.map((account) => (
                        <tr key={account.account}>
                          <td style={{ padding: 10, fontWeight: 600 }}>{account.account}</td>
                          <td style={{ padding: 10 }}>{money(account.salesCollections)}</td>
                          <td style={{ padding: 10 }}>{money(account.manualNetMovement)}</td>
                          <td style={{ padding: 10, fontWeight: 750 }}>{money(account.balance)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div style={cardStyle}>
                <h3 style={{ marginTop: 0 }}>Important Accounting Notes</h3>
                <ul style={{ color: "#4b5563", fontSize: 13, lineHeight: 1.8 }}>
                  <li>Cash payments add to Cash; UPI, card and bank-transfer payments add to Bank.</li>
                  <li>Founder investments increase funds, but are not sales revenue.</li>
                  <li>Inventory purchases are cash outflows; stock cost is recognized when the products are sold.</li>
                  <li>Transfers between Cash and Bank should change the two balances but not total funds.</li>
                  <li>
                    {summary.salesWithUnknownCost || 0} sold item record(s) have
                    missing weight or silver-rate data for the current profit estimate.
                  </li>
                  <li>Current profit is only an estimate until labour, packaging, other costs and all sold-item costs are accounted for.</li>
                </ul>
                {data?.note && (
                  <p style={{ color: "#6b7280", fontSize: 12 }}>{data.note}</p>
                )}
              </div>
            </>
          )}

        
{activeTab === "transactions" && (() => {
  const sales = data?.sales || [];

  const saleRows = sales.map((sale) => {
    const paid = Math.max(0, Number(sale.amountPaid) || 0);
    const balance = Math.max(0, Number(sale.balance) || 0);
    const payments = Array.isArray(sale.paymentSummary)
      ? sale.paymentSummary
      : [];

    let cash = 0;
    let bank = 0;

    if (payments.length) {
      const total = payments.reduce(
        (sum, p) => sum + Math.max(0, Number(p.amount) || 0),
        0
      );

      if (Math.abs(total - paid) < 0.02) {
        payments.forEach((p) => {
          const amount = Math.max(0, Number(p.amount) || 0);
          if (String(p.method || "").toLowerCase() === "cash") {
            cash += amount;
          } else {
            bank += amount;
          }
        });
      } else {
        const method = String(sale.paymentMethod || "").toLowerCase();
        if (method === "cash") cash = paid;
        else bank = paid;
      }
    } else {
      const method = String(sale.paymentMethod || "").toLowerCase();
      if (method === "cash") cash = paid;
      else bank = paid;
    }

    return {
      id: `sale-${sale._id}`,
      date: sale.createdAt,
      type: "sale",
      title: `Sale ${sale.billNumber || ""}`.trim(),
      description: sale.customer?.name || sale.customerName || "Customer",
      reference: sale.billNumber || "",
      method: sale.paymentMethod || "Other",
      account: cash > 0 && bank > 0 ? "Cash + Bank" : cash > 0 ? "Cash" : "Bank",
      moneyIn: paid,
      moneyOut: 0,
      cashIn: cash,
      bankIn: bank,
      outstanding: balance,
      isSale: true,
    };
  });

  const manualRows = transactions.map((t) => ({
    id: `txn-${t._id}`,
    date: t.transactionDate,
    type: t.type,
    title: TYPES.find((x) => x.value === t.type)?.label || t.type,
    description: t.description || t.category,
    reference: t.reference || "",
    method: t.paymentMethod || "—",
    account: t.type === "transfer"
      ? `${t.account} → ${t.transferToAccount}`
      : t.account,
    moneyIn: t.direction === "in" && t.type !== "transfer" ? Number(t.amount) || 0 : 0,
    moneyOut: t.direction === "out" && t.type !== "transfer" ? Number(t.amount) || 0 : 0,
    cashIn: t.direction === "in" && t.account === "Cash" && t.type !== "transfer" ? Number(t.amount) || 0 : 0,
    bankIn: t.direction === "in" && t.account === "Bank" && t.type !== "transfer" ? Number(t.amount) || 0 : 0,
    outstanding: 0,
    isSale: false,
    original: t,
  }));

  const allRows = [...saleRows, ...manualRows]
    .filter((r) => {
      const matchesType =
        typeFilter === "all" ||
        (typeFilter === "sale" ? r.isSale : r.type === typeFilter);

      const text = [
        r.title, r.description, r.reference, r.method, r.account,
      ].join(" ").toLowerCase();

      return matchesType && text.includes(search.toLowerCase());
    })
    .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

  const periodMoneyIn = allRows.reduce((s, r) => s + r.moneyIn, 0);
  const periodMoneyOut = allRows.reduce((s, r) => s + r.moneyOut, 0);

  const cashBalance = Number(
    accounts.find((a) => a.account === "Cash")?.balance || 0
  );
  const bankBalance = Number(
    accounts.find((a) => a.account === "Bank")?.balance || 0
  );

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
        gap: 12,
      }}>
        <Metric
          label="Total Money In"
          value={periodMoneyIn}
          note="Selected period; respects current ledger filters"
          color="#166534"
        />
        <Metric
          label="Total Money Out"
          value={periodMoneyOut}
          note="Selected period; respects current ledger filters"
          color="#b91c1c"
        />
        <Metric
          label="Expected Cash in Hand"
          value={cashBalance}
          note="All recorded history"
        />
        <Metric
          label="Expected Bank Balance"
          value={bankBalance}
          note="All recorded history"
        />
        <Metric
          label="Total Expected Funds"
          value={cashBalance + bankBalance}
          note="Cash + Bank"
        />
      </div>

      <div style={cardStyle}>
        <h3 style={{ marginTop: 0 }}>Complete Money Ledger</h3>
        <p style={{ color: "#6b7280", fontSize: 12 }}>
          Sales collections and manual transactions appear together.
          Sales are read from bills; do not enter them again manually.
        </p>

        <div style={{
          display: "flex",
          gap: 10,
          flexWrap: "wrap",
          marginBottom: 16,
        }}>
          <input
            placeholder="Search bill, category, person..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ ...inputStyle, flex: "1 1 220px" }}
          />

          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            style={{ ...inputStyle, flex: "1 1 200px" }}
          >
            <option value="all">All transactions</option>
            <option value="sale">Sales</option>
            {TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table style={{
            width: "100%",
            minWidth: 1000,
            borderCollapse: "collapse",
            fontSize: 12,
          }}>
            <thead>
              <tr>
                {[
                  "Date", "Transaction", "Details", "Method",
                  "Account", "Money In", "Money Out", "Outstanding", "Action",
                ].map((heading) => (
                  <th key={heading} style={{
                    textAlign: "left",
                    padding: 10,
                    borderBottom: "1px solid #e5e7eb",
                    whiteSpace: "nowrap",
                  }}>
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {allRows.map((row) => (
                <tr key={row.id}>
                  <td style={{ padding: 10, whiteSpace: "nowrap" }}>
                    {dateText(row.date)}
                  </td>
                  <td style={{ padding: 10, fontWeight: 650 }}>
                    {row.title}
                  </td>
                  <td style={{ padding: 10 }}>
                    {row.description || "—"}
                    {row.reference && (
                      <div style={{ color: "#6b7280", marginTop: 3 }}>
                        Ref: {row.reference}
                      </div>
                    )}
                  </td>
                  <td style={{ padding: 10 }}>{row.method}</td>
                  <td style={{ padding: 10 }}>{row.account}</td>
                  <td style={{
                    padding: 10,
                    color: row.moneyIn ? "#166534" : "inherit",
                    fontWeight: row.moneyIn ? 700 : 400,
                    whiteSpace: "nowrap",
                  }}>
                    {row.moneyIn ? money(row.moneyIn) : "—"}
                  </td>
                  <td style={{
                    padding: 10,
                    color: row.moneyOut ? "#b91c1c" : "inherit",
                    fontWeight: row.moneyOut ? 700 : 400,
                    whiteSpace: "nowrap",
                  }}>
                    {row.moneyOut ? money(row.moneyOut) : "—"}
                  </td>
                  <td style={{ padding: 10, whiteSpace: "nowrap" }}>
                    {row.isSale && row.outstanding > 0
                      ? money(row.outstanding)
                      : "—"}
                  </td>
                  <td style={{ padding: 10 }}>
                    {!row.isSale && row.original && (
                      <button
                        type="button"
                        onClick={() => voidTransaction(row.original)}
                        style={{
                          border: "1px solid #fecaca",
                          background: "#fff",
                          color: "#b91c1c",
                          borderRadius: 6,
                          padding: "6px 8px",
                          cursor: "pointer",
                        }}
                      >
                        Void
                      </button>
                    )}
                  </td>
                </tr>
              ))}

              {allRows.length === 0 && (
                <tr>
                  <td colSpan={9} style={{
                    padding: 24,
                    textAlign: "center",
                    color: "#6b7280",
                  }}>
                    No transactions found for this period.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
})()}


          {activeTab === "add" && (
            <form onSubmit={saveTransaction} style={{ ...cardStyle, maxWidth: 850 }}>
              <h3 style={{ marginTop: 0 }}>Record a Transaction</h3>
              <p style={{ color: "#6b7280", fontSize: 12 }}>
                Existing sales are loaded from bills. Do not enter sale collections again here.
              </p>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>
                <div>
                  <label style={labelStyle}>Transaction Date *</label>
                  <input type="date" required value={form.transactionDate} onChange={(e) => updateForm("transactionDate", e.target.value)} style={inputStyle} />
                </div>

                <div>
                  <label style={labelStyle}>Transaction Type *</label>
                  <select required value={form.type} onChange={(e) => updateForm("type", e.target.value)} style={inputStyle}>
                    {TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
                  </select>
                </div>

                <div>
                  <label style={labelStyle}>Amount (₹) *</label>
                  <input required type="number" min="0.01" step="0.01" value={form.amount} onChange={(e) => updateForm("amount", e.target.value)} placeholder="Enter amount" style={inputStyle} />
                </div>

                <div>
                  <label style={labelStyle}>Category *</label>
                  <input required list="expense-categories" value={form.category} onChange={(e) => updateForm("category", e.target.value)} placeholder="e.g. Rent, Packaging" style={inputStyle} />
                  <datalist id="expense-categories">
                    {(CATEGORIES[form.type] || []).map((category) => <option key={category} value={category} />)}
                  </datalist>
                </div>

                <div>
                  <label style={labelStyle}>Person / Founder</label>
                  <select value={form.person} onChange={(e) => updateForm("person", e.target.value)} style={inputStyle}>
                    {PEOPLE.map((person) => <option key={person} value={person}>{person || "Not specified"}</option>)}
                  </select>
                </div>

                <div>
                  <label style={labelStyle}>Payment Method *</label>
                  <select required value={form.paymentMethod} onChange={(e) => updateForm("paymentMethod", e.target.value)} style={inputStyle}>
                    {METHODS.map((method) => <option key={method} value={method}>{method}</option>)}
                  </select>
                </div>

                <div>
                  <label style={labelStyle}>Money Account *</label>
                  <select required value={form.account} onChange={(e) => updateForm("account", e.target.value)} style={inputStyle}>
                    {ACCOUNTS.map((account) => <option key={account} value={account}>{account}</option>)}
                  </select>
                  <small style={{ color: "#6b7280" }}>
                    Cash payments use Cash. Digital payments use Bank.
                  </small>
                </div>

                {form.type === "transfer" && (
                  <div>
                    <label style={labelStyle}>Transfer To *</label>
                    <select required value={form.transferToAccount} onChange={(e) => updateForm("transferToAccount", e.target.value)} style={inputStyle}>
                      {ACCOUNTS.filter((account) => account !== form.account).map((account) => (
                        <option key={account} value={account}>{account}</option>
                      ))}
                    </select>
                  </div>
                )}

                <div>
                  <label style={labelStyle}>Reference / Bill Number</label>
                  <input value={form.reference} onChange={(e) => updateForm("reference", e.target.value)} placeholder="Optional reference" style={inputStyle} />
                </div>

                <div style={{ gridColumn: "1 / -1" }}>
                  <label style={labelStyle}>Description / Notes</label>
                  <textarea rows={3} value={form.description} onChange={(e) => updateForm("description", e.target.value)} placeholder="What was the money used for or received against?" style={{ ...inputStyle, resize: "vertical" }} />
                </div>
              </div>

              <div style={{ marginTop: 18, padding: 12, borderRadius: 8, background: "#f9fafb", color: "#4b5563", fontSize: 12, lineHeight: 1.6 }}>
                {form.type === "capital_contribution" && "Founder investment adds money to the selected account but is not revenue."}
                {form.type === "founder_loan" && "A founder loan is money the business owes to that founder."}
                {form.type === "founder_withdrawal" && "A founder withdrawal reduces funds but is not automatically an expense."}
                {form.type === "inventory_purchase" && "Inventory purchase reduces Cash or Bank. It is not automatically an operating expense."}
                {form.type === "transfer" && "Transfer money between Cash and Bank. It changes both balances, not profit."}
                {form.type === "opening_balance" && "Enter the starting balance only once. Do not use this to record new funding."}
                {form.type === "expense" && "Record genuine business costs such as rent, shipping, packaging or marketing."}
                {!["capital_contribution", "founder_loan", "founder_withdrawal", "inventory_purchase", "transfer", "opening_balance", "expense"].includes(form.type) && "Enter the actual money movement and a clear reference where possible."}
              </div>

              <button type="submit" disabled={saving} style={{
                marginTop: 16,
                padding: "12px 18px",
                border: 0,
                borderRadius: 8,
                background: saving ? "#9ca3af" : "#111827",
                color: "#fff",
                fontWeight: 650,
                cursor: saving ? "wait" : "pointer",
              }}>
                {saving ? "Saving..." : "Save Transaction"}
              </button>
            </form>
          )}

          {activeTab === "founders" && (
            <div style={cardStyle}>
              <h3 style={{ marginTop: 0 }}>Founder Accounts</h3>
              <p style={{ color: "#6b7280", fontSize: 12 }}>
                Figures reflect the selected date range. Choose All dates for all recorded transactions.
              </p>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 14 }}>
                {founders.map((founder) => (
                  <div key={founder.person} style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 16 }}>
                    <h3 style={{ marginTop: 0 }}>{founder.person}</h3>
                    <div style={{ marginBottom: 12 }}>
                      <div style={{ color: "#6b7280", fontSize: 12 }}>Capital Invested</div>
                      <strong>{money(founder.capitalAdded)}</strong>
                    </div>
                    <div style={{ marginBottom: 12 }}>
                      <div style={{ color: "#6b7280", fontSize: 12 }}>Loans to Business</div>
                      <strong>{money(founder.loansGiven)}</strong>
                    </div>
                    <div>
                      <div style={{ color: "#6b7280", fontSize: 12 }}>Withdrawals</div>
                      <strong>{money(founder.withdrawals)}</strong>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
