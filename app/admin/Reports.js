
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

const currency = (value) =>
  value == null
    ? "—"
    : new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
        maximumFractionDigits: 2,
      }).format(Number(value) || 0);

const number = (value) =>
  new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: 2,
  }).format(Number(value) || 0);

function localDate(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getPresetRange(preset) {
  const today = new Date();
  const to = localDate(today);
  const fromDate = new Date(today);

  if (preset === "yesterday") {
    fromDate.setDate(fromDate.getDate() - 1);
    const yesterday = localDate(fromDate);
    return { from: yesterday, to: yesterday };
  }

  if (preset === "7days") fromDate.setDate(fromDate.getDate() - 6);
  else if (preset === "30days") fromDate.setDate(fromDate.getDate() - 29);
  else if (preset === "month") fromDate.setDate(1);

  return { from: localDate(fromDate), to };
}

const styles = {
  page: {
    color: "var(--text, #172033)",
    display: "grid",
    gap: 20,
    width: "100%",
  },
  header: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 16,
    flexWrap: "wrap",
  },
  muted: { color: "var(--muted, #687386)", fontSize: 13 },
  card: {
    border: "1px solid var(--border, #e3e7ee)",
    borderRadius: 14,
    background: "var(--panel, #fff)",
    padding: 18,
    minWidth: 0,
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(185px, 1fr))",
    gap: 12,
  },
  controls: {
    display: "flex",
    gap: 10,
    alignItems: "end",
    flexWrap: "wrap",
  },
  label: {
    display: "grid",
    gap: 6,
    fontSize: 12,
    color: "var(--muted, #687386)",
  },
  input: {
    border: "1px solid var(--border, #d8dee8)",
    borderRadius: 8,
    padding: "10px 12px",
    background: "var(--panel, #fff)",
    color: "inherit",
    minHeight: 40,
  },
  button: {
    border: "1px solid var(--border, #d8dee8)",
    borderRadius: 8,
    padding: "10px 13px",
    background: "var(--panel, #fff)",
    color: "inherit",
    cursor: "pointer",
    minHeight: 40,
  },
  primary: {
    border: "1px solid #172033",
    borderRadius: 8,
    padding: "10px 14px",
    background: "#172033",
    color: "#fff",
    cursor: "pointer",
    minHeight: 40,
  },
  tableWrap: { overflowX: "auto", width: "100%" },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: 13,
    whiteSpace: "nowrap",
  },
  th: {
    textAlign: "left",
    padding: "11px 12px",
    background: "var(--table-head, #f5f7fa)",
    borderBottom: "1px solid var(--border, #e3e7ee)",
    color: "var(--muted, #687386)",
    fontWeight: 600,
  },
  td: {
    padding: "12px",
    borderBottom: "1px solid var(--border, #edf0f4)",
    verticalAlign: "top",
  },
  sectionTitle: { margin: "0 0 4px", fontSize: 17 },
};

function Metric({ title, value, note }) {
  return (
    <div style={styles.card}>
      <div style={styles.muted}>{title}</div>
      <div
        style={{
          fontSize: 23,
          fontWeight: 750,
          marginTop: 10,
          overflowWrap: "anywhere",
        }}
      >
        {value}
      </div>
      {note && (
        <div style={{ ...styles.muted, marginTop: 7 }}>{note}</div>
      )}
    </div>
  );
}

function Table({ columns, rows, empty = "No data for this date range." }) {
  return (
    <div style={styles.tableWrap}>
      <table style={styles.table}>
        <thead>
          <tr>
            {columns.map((column) => (
              <th style={styles.th} key={column.key}>
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {!rows?.length ? (
            <tr>
              <td style={styles.td} colSpan={columns.length}>
                {empty}
              </td>
            </tr>
          ) : (
            rows.map((row, index) => (
              <tr key={row._id || row.key || row.date || row.month || index}>
                {columns.map((column) => (
                  <td style={styles.td} key={column.key}>
                    {column.render
                      ? column.render(row)
                      : row[column.key] ?? "—"}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function downloadCSV(filename, rows) {
  if (!rows?.length) return;

  const headers = Object.keys(rows[0]);
  const escapeCSV = (value) => {
    const text = String(value ?? "");
    return `"${text.replace(/"/g, '""')}"`;
  };

  const content = [
    headers.map(escapeCSV).join(","),
    ...rows.map((row) =>
      headers.map((header) => escapeCSV(row[header])).join(",")
    ),
  ].join("\r\n");

  const blob = new Blob(["\uFEFF", content], {
    type: "text/csv;charset=utf-8;",
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export default function Reports() {
  const initialRange = useMemo(() => getPresetRange("today"), []);

  const [from, setFrom] = useState(initialRange.from);
  const [to, setTo] = useState(initialRange.to);
  const [preset, setPreset] = useState("today");
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("bills");
  const [expandedBill, setExpandedBill] = useState(null);

  const loadReport = useCallback(async () => {
    if (!from || !to) {
      setError("Please select both dates.");
      return;
    }

    if (from > to) {
      setError("Start date cannot be after end date.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response = await fetch(
        `/api/admin/reports?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
        { cache: "no-store" }
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Could not load reports.");
      }

      setReport(data);
    } catch (err) {
      setError(err.message || "Could not load reports.");
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  function selectPreset(value) {
    setPreset(value);
    if (value === "custom") return;

    const range = getPresetRange(value);
    setFrom(range.from);
    setTo(range.to);
  }

  const summary = report?.summary;
  const bills = report?.bills || [];

  const itemRows = useMemo(() => {
    return bills.flatMap((bill) =>
      (bill.items || []).map((item, index) => ({
        key: `${bill._id}-${index}`,
        billNumber: bill.billNumber,
        date: bill.createdAt
          ? new Date(bill.createdAt).toLocaleString("en-IN", {
              dateStyle: "medium",
              timeStyle: "short",
              timeZone: "Asia/Kolkata",
            })
          : "—",
        customer: bill.customerName,
        name: item.name || "Unnamed product",
        sku: item.sku || "—",
        batchId: item.batchId || "—",
        weight: item.weight,
        listPrice: item.listPrice,
        discount: item.discountAmount,
        sellingPrice: item.finalPrice,
        cpInstant: item.pricing?.cpInstant,
        cpSource: item.pricing?.cpSource,
        profitInstant: item.pricing?.profitInstant,
        profitSource: item.pricing?.profitSource,
      }))
    );
  }, [bills]);

  const profitByDateColumns = [
    {
      key: "date",
      label: "Date",
      render: (row) => row.date,
    },
    { key: "bills", label: "Bills" },
    {
      key: "netSales",
      label: "Net sales",
      render: (row) => currency(row.netSales),
    },
    {
      key: "profitInstant",
      label: "Profit Instant",
      render: (row) => currency(row.profitInstant),
    },
    {
      key: "profitSource",
      label: "Profit Source",
      render: (row) => currency(row.profitSource),
    },
  ];

  const tabs = [
    ["bills", "Bills"],
    ["items", "Item-wise profit"],
    ["daily", "Daily"],
    ["monthly", "Monthly"],
    ["products", "Best sellers"],
    ["stock", "Stock alerts"],
    ["payments", "Payments"],
    ["salespersons", "Salespersons"],
  ];

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <div>
          <div style={styles.muted}>SIVAAH / ADMINISTRATION</div>
          <h2 style={{ margin: "6px 0", fontSize: 26 }}>Reports & Analytics</h2>
          <div style={styles.muted}>
            Sales, item-level costs, both profit calculations and stock alerts.
          </div>
        </div>

        <button
          style={styles.button}
          onClick={() => {
            if (report) {
              downloadCSV("sivaah-bills.csv", bills.map((bill) => ({
                billNumber: bill.billNumber,
                date: bill.createdAt,
                customer: bill.customerName,
                salesperson: bill.salespersonName,
                silverRateAtSale: bill.silverRateAtSale,
                grossAmount: bill.grossAmount,
                discountAmount: bill.discountAmount,
                netAmount: bill.netAmount,
                amountPaid: bill.amountPaid,
                balance: bill.balance,
                profitInstant: bill.profitInstant,
                profitSource: bill.profitSource,
              })));
            }
          }}
          disabled={!report || !bills.length}
        >
          Export bills CSV
        </button>
      </div>

      <section style={styles.card}>
        <div style={styles.controls}>
          <label style={styles.label}>
            Quick range
            <select
              style={styles.input}
              value={preset}
              onChange={(event) => selectPreset(event.target.value)}
            >
              <option value="today">Today</option>
              <option value="yesterday">Yesterday</option>
              <option value="7days">Last 7 days</option>
              <option value="30days">Last 30 days</option>
              <option value="month">This month</option>
              <option value="custom">Custom range</option>
            </select>
          </label>

          <label style={styles.label}>
            From
            <input
              style={styles.input}
              type="date"
              value={from}
              onChange={(event) => {
                setPreset("custom");
                setFrom(event.target.value);
              }}
            />
          </label>

          <label style={styles.label}>
            To
            <input
              style={styles.input}
              type="date"
              value={to}
              onChange={(event) => {
                setPreset("custom");
                setTo(event.target.value);
              }}
            />
          </label>

          <button style={styles.primary} onClick={loadReport} disabled={loading}>
            {loading ? "Loading..." : "Apply filters"}
          </button>
        </div>

        <p style={{ ...styles.muted, marginBottom: 0 }}>
          All selected dates are interpreted in Indian Standard Time.
        </p>
      </section>

      {error && (
        <div
          role="alert"
          style={{
            ...styles.card,
            borderColor: "#dc7777",
            color: "#b42318",
          }}
        >
          {error}
        </div>
      )}

      {loading && !report && (
        <div style={styles.card}>Loading reports…</div>
      )}

      {summary && (
        <>
          <div style={styles.grid}>
            <Metric
              title="Net sales"
              value={currency(summary.netSales)}
              note={`${number(summary.bills)} completed bills`}
            />
            <Metric
              title="Gross sales"
              value={currency(summary.grossSales)}
              note={`Discounts: ${currency(summary.discounts)}`}
            />
            <Metric
              title="Profit Instant"
              value={currency(summary.profitInstant)}
              note="Actual selling price minus CP at sale-date rate"
            />
            <Metric
              title="Profit Source"
              value={currency(summary.profitSource)}
              note="Actual selling price minus original source cost"
            />
            <Metric
              title="Average bill value"
              value={currency(summary.averageBillValue)}
              note="Net sales divided by bill count"
            />
            <Metric
              title="Amount collected"
              value={currency(summary.amountPaid)}
              note={`Outstanding: ${currency(summary.balance)}`}
            />
            <Metric
              title="Pieces sold"
              value={number(summary.piecesSold)}
              note={`Weight: ${number(summary.totalWeight)} g`}
            />
            <Metric
              title="Total discounts"
              value={currency(summary.discounts)}
              note="Discounts recorded on completed bills"
            />
          </div>

          <section style={styles.card}>
            <h3 style={styles.sectionTitle}>Profit definitions</h3>
            <p style={styles.muted}>
              Profit Instant = final selling price after discount − CP Instant.
              Profit Source = final selling price after discount − CP Source.
              Cost includes silver value, batch labour per gram and ₹50 packaging
              per item. These are item gross profits, not net profit after rent,
              salaries, utilities or other outlet expenses.
            </p>
          </section>

          <section style={styles.card}>
            <div
              style={{
                display: "flex",
                gap: 8,
                flexWrap: "wrap",
                marginBottom: 18,
              }}
            >
              {tabs.map(([key, label]) => (
                <button
                  key={key}
                  style={activeTab === key ? styles.primary : styles.button}
                  onClick={() => setActiveTab(key)}
                >
                  {label}
                </button>
              ))}
            </div>

            {activeTab === "bills" && (
              <>
                <h3 style={styles.sectionTitle}>Bill-wise report</h3>
                <p style={styles.muted}>
                  Select a bill to inspect its item-level prices and profits.
                </p>
                <Table
                  columns={[
                    { key: "billNumber", label: "Bill no." },
                    {
                      key: "createdAt",
                      label: "Date / time",
                      render: (row) =>
                        row.createdAt
                          ? new Date(row.createdAt).toLocaleString("en-IN", {
                              dateStyle: "medium",
                              timeStyle: "short",
                              timeZone: "Asia/Kolkata",
                            })
                          : "—",
                    },
                    { key: "customerName", label: "Customer" },
                    { key: "salespersonName", label: "Salesperson" },
                    {
                      key: "netAmount",
                      label: "Net sales",
                      render: (row) => currency(row.netAmount),
                    },
                    {
                      key: "profitInstant",
                      label: "Profit Instant",
                      render: (row) => currency(row.profitInstant),
                    },
                    {
                      key: "profitSource",
                      label: "Profit Source",
                      render: (row) => currency(row.profitSource),
                    },
                    {
                      key: "details",
                      label: "Details",
                      render: (row) => (
                        <button
                          style={styles.button}
                          onClick={() =>
                            setExpandedBill(
                              expandedBill === row._id ? null : row._id
                            )
                          }
                        >
                          {expandedBill === row._id ? "Hide" : "View items"}
                        </button>
                      ),
                    },
                  ]}
                  rows={bills}
                />

                {bills
                  .filter((bill) => bill._id === expandedBill)
                  .map((bill) => (
                    <div
                      key={bill._id}
                      style={{
                        marginTop: 16,
                        border: "1px solid var(--border, #e3e7ee)",
                        borderRadius: 10,
                        padding: 14,
                      }}
                    >
                      <h4 style={{ marginTop: 0 }}>
                        {bill.billNumber} — Item details
                      </h4>
                      <p style={styles.muted}>
                        Silver rate at sale: {currency(bill.silverRateAtSale)}
                      </p>
                      <Table
                        columns={[
                          { key: "name", label: "Item" },
                          { key: "batchId", label: "Batch ID" },
                          {
                            key: "weight",
                            label: "Weight",
                            render: (item) => `${number(item.weight)} g`,
                          },
                          {
                            key: "listPrice",
                            label: "List price",
                            render: (item) => currency(item.listPrice),
                          },
                          {
                            key: "discountAmount",
                            label: "Discount",
                            render: (item) => currency(item.discountAmount),
                          },
                          {
                            key: "finalPrice",
                            label: "Actual SP",
                            render: (item) => currency(item.finalPrice),
                          },
                          {
                            key: "cpInstant",
                            label: "CP Instant",
                            render: (item) => currency(item.pricing?.cpInstant),
                          },
                          {
                            key: "cpSource",
                            label: "CP Source",
                            render: (item) => currency(item.pricing?.cpSource),
                          },
                          {
                            key: "profitInstant",
                            label: "Profit Instant",
                            render: (item) =>
                              currency(item.pricing?.profitInstant),
                          },
                          {
                            key: "profitSource",
                            label: "Profit Source",
                            render: (item) =>
                              currency(item.pricing?.profitSource),
                          },
                        ]}
                        rows={bill.items.map((item, index) => ({
                          ...item,
                          key: `${bill._id}-${index}`,
                        }))}
                      />
                    </div>
                  ))}
              </>
            )}

            {activeTab === "items" && (
              <>
                <h3 style={styles.sectionTitle}>Item-wise profit report</h3>
                <button
                  style={{ ...styles.button, margin: "12px 0" }}
                  onClick={() =>
                    downloadCSV(
                      "sivaah-item-profit.csv",
                      itemRows.map((row) => ({
                        billNumber: row.billNumber,
                        date: row.date,
                        customer: row.customer,
                        item: row.name,
                        sku: row.sku,
                        batchId: row.batchId,
                        weight: row.weight,
                        listPrice: row.listPrice,
                        discount: row.discount,
                        actualSellingPrice: row.sellingPrice,
                        cpInstant: row.cpInstant,
                        cpSource: row.cpSource,
                        profitInstant: row.profitInstant,
                        profitSource: row.profitSource,
                      }))
                    )
                  }
                >
                  Export item report CSV
                </button>
                <Table
                  columns={[
                    { key: "billNumber", label: "Bill" },
                    { key: "date", label: "Date" },
                    { key: "name", label: "Item" },
                    { key: "sku", label: "SKU" },
                    { key: "batchId", label: "Batch ID" },
                    {
                      key: "weight",
                      label: "Weight",
                      render: (row) => `${number(row.weight)} g`,
                    },
                    {
                      key: "sellingPrice",
                      label: "Actual SP",
                      render: (row) => currency(row.sellingPrice),
                    },
                    {
                      key: "cpInstant",
                      label: "CP Instant",
                      render: (row) => currency(row.cpInstant),
                    },
                    {
                      key: "cpSource",
                      label: "CP Source",
                      render: (row) => currency(row.cpSource),
                    },
                    {
                      key: "profitInstant",
                      label: "Profit Instant",
                      render: (row) => currency(row.profitInstant),
                    },
                    {
                      key: "profitSource",
                      label: "Profit Source",
                      render: (row) => currency(row.profitSource),
                    },
                  ]}
                  rows={itemRows}
                />
              </>
            )}

            {activeTab === "daily" && (
              <>
                <h3 style={styles.sectionTitle}>Daily performance</h3>
                <Table columns={profitByDateColumns} rows={report.daily} />
                <button
                  style={{ ...styles.button, marginTop: 12 }}
                  onClick={() =>
                    downloadCSV("sivaah-daily-report.csv", report.daily)
                  }
                >
                  Export daily CSV
                </button>
              </>
            )}

            {activeTab === "monthly" && (
              <>
                <h3 style={styles.sectionTitle}>Monthly performance</h3>
                <Table
                  columns={[
                    { key: "month", label: "Month" },
                    { key: "bills", label: "Bills" },
                    {
                      key: "netSales",
                      label: "Net sales",
                      render: (row) => currency(row.netSales),
                    },
                    {
                      key: "profitInstant",
                      label: "Profit Instant",
                      render: (row) => currency(row.profitInstant),
                    },
                    {
                      key: "profitSource",
                      label: "Profit Source",
                      render: (row) => currency(row.profitSource),
                    },
                  ]}
                  rows={report.monthly}
                />
                <button
                  style={{ ...styles.button, marginTop: 12 }}
                  onClick={() =>
                    downloadCSV("sivaah-monthly-report.csv", report.monthly)
                  }
                >
                  Export monthly CSV
                </button>
              </>
            )}

            {activeTab === "products" && (
              <>
                <h3 style={styles.sectionTitle}>Best-selling products</h3>
                <Table
                  columns={[
                    { key: "name", label: "Product" },
                    { key: "sku", label: "SKU" },
                    { key: "unitsSold", label: "Pieces sold" },
                    {
                      key: "revenue",
                      label: "Revenue",
                      render: (row) => currency(row.revenue),
                    },
                    {
                      key: "profitInstant",
                      label: "Profit Instant",
                      render: (row) => currency(row.profitInstant),
                    },
                    {
                      key: "profitSource",
                      label: "Profit Source",
                      render: (row) => currency(row.profitSource),
                    },
                  ]}
                  rows={report.bestSellers}
                />
              </>
            )}

            {activeTab === "stock" && (
              <div style={{ display: "grid", gap: 20 }}>
                <div>
                  <h3 style={styles.sectionTitle}>Exactly one piece left</h3>
                  <Table
                    columns={[
                      { key: "name", label: "Product" },
                      { key: "sku", label: "SKU" },
                      { key: "stockCount", label: "Pieces left" },
                      {
                        key: "stockWeight",
                        label: "Weight",
                        render: (row) => `${number(row.stockWeight)} g`,
                      },
                      {
                        key: "inStockPieces",
                        label: "Batch IDs",
                        render: (row) =>
                          row.inStockPieces.map((piece) => piece.batchId).join(", "),
                      },
                    ]}
                    rows={report.stock.onePieceLeft}
                  />
                </div>
                <div>
                  <h3 style={styles.sectionTitle}>Low stock (2–3 pieces)</h3>
                  <Table
                    columns={[
                      { key: "name", label: "Product" },
                      { key: "sku", label: "SKU" },
                      { key: "stockCount", label: "Pieces left" },
                    ]}
                    rows={report.stock.lowStock}
                  />
                </div>
                <div>
                  <h3 style={styles.sectionTitle}>Out of stock</h3>
                  <Table
                    columns={[
                      { key: "name", label: "Product" },
                      { key: "sku", label: "SKU" },
                      { key: "stockCount", label: "Pieces left" },
                    ]}
                    rows={report.stock.outOfStock}
                  />
                </div>
              </div>
            )}

            {activeTab === "payments" && (
              <>
                <h3 style={styles.sectionTitle}>Payment breakdown</h3>
                <Table
                  columns={[
                    { key: "method", label: "Payment method" },
                    {
                      key: "amount",
                      label: "Amount collected",
                      render: (row) => currency(row.amount),
                    },
                  ]}
                  rows={report.paymentBreakdown}
                />
              </>
            )}

            {activeTab === "salespersons" && (
              <>
                <h3 style={styles.sectionTitle}>Salesperson performance</h3>
                <Table
                  columns={[
                    { key: "name", label: "Salesperson" },
                    { key: "bills", label: "Bills" },
                    {
                      key: "netSales",
                      label: "Net sales",
                      render: (row) => currency(row.netSales),
                    },
                    {
                      key: "profitInstant",
                      label: "Profit Instant",
                      render: (row) => currency(row.profitInstant),
                    },
                    {
                      key: "profitSource",
                      label: "Profit Source",
                      render: (row) => currency(row.profitSource),
                    },
                  ]}
                  rows={report.salespersons}
                />
              </>
            )}
          </section>
        </>
      )}
    </div>
  );
}
