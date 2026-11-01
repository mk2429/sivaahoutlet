
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

const CUTOVER_DATE = "2026-10-27";

function localToday() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function monthEnd(month) {
  const [year, m] = month.split("-").map(Number);
  return `${year}-${String(m).padStart(2, "0")}-${String(new Date(year, m, 0).getDate()).padStart(2, "0")}`;
}

function money(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(n);
}

function grams(value) {
  const n = Number(value);
  return Number.isFinite(n)
    ? `${n.toLocaleString("en-IN", {
        minimumFractionDigits: 3,
        maximumFractionDigits: 3,
      })} g`
    : "—";
}

function number(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

async function getJson(url) {
  const response = await fetch(url, {
    method: "GET",
    credentials: "same-origin",
    cache: "no-store",
  });

  const data = await response.json();

  if (!response.ok || data.success === false) {
    throw new Error(
      data.message || data.error || `Request failed: ${url}`
    );
  }

  return data;
}

function Card({ label, value, note, tone = "normal" }) {
  return (
    <article
      style={{
        ...styles.card,
        borderTop: `3px solid ${
          tone === "green"
            ? "#15803d"
            : tone === "red"
            ? "#dc2626"
            : "#d8ddd8"
        }`,
      }}
    >
      <div style={styles.cardLabel}>{label}</div>

      <div
        style={{
          ...styles.cardValue,
          color:
            tone === "green"
              ? "#15803d"
              : tone === "red"
              ? "#b91c1c"
              : "#111827",
        }}
      >
        {value}
      </div>

      {note ? <div style={styles.cardNote}>{note}</div> : null}
    </article>
  );
}

function Section({ title, subtitle, children }) {
  return (
    <section style={styles.section}>
      <div style={styles.sectionHeading}>
        <div>
          <h3 style={styles.sectionTitle}>{title}</h3>
          {subtitle ? (
            <p style={styles.sectionSubtitle}>{subtitle}</p>
          ) : null}
        </div>
      </div>

      {children}
    </section>
  );
}

function Table({ headers, rows, empty = "No entries for this period." }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={styles.table}>
        <thead>
          <tr>
            {headers.map((h) => (
              <th key={h} style={styles.th}>
                {h}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {rows.length ? (
            rows.map((row, i) => (
              <tr key={row.key || i}>
                {row.cells.map((cell, j) => (
                  <td key={j} style={styles.td}>
                    {cell}
                  </td>
                ))}
              </tr>
            ))
          ) : (
            <tr>
              <td
                colSpan={headers.length}
                style={{
                  ...styles.td,
                  color: "#6b7280",
                  textAlign: "center",
                  padding: 22,
                }}
              >
                {empty}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export default function FinancialDashboard() {
  const initialMonth = localToday().slice(0, 7);

  const [month, setMonth] = useState(
    initialMonth < "2026-10" ? "2026-10" : initialMonth
  );

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeDetail, setActiveDetail] = useState("sales");
  const [lastUpdated, setLastUpdated] = useState(null);

  const range = useMemo(() => {
    const monthStart = `${month}-01`;

    const from =
      month === "2026-10" ? CUTOVER_DATE : monthStart;

    const to =
      month === localToday().slice(0, 7)
        ? localToday()
        : monthEnd(month);

    return { from, to };
  }, [month]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    setData(null);

    try {
      const qs =
        `from=${encodeURIComponent(range.from)}` +
        `&to=${encodeURIComponent(range.to)}`;

      const [closing, accounts, silver, reports, matching] =
        await Promise.all([
          getJson(
            `/api/admin/monthly-closing?month=${encodeURIComponent(month)}`
          ),
          getJson(`/api/admin/expenses?${qs}`),
          getJson(`/api/admin/jewellery-ledger?${qs}`),
          getJson(`/api/admin/reports?${qs}`),
          getJson(`/api/admin/silver-matching`),
        ]);

      setData({
        closing,
        accounts,
        silver,
        reports,
        matching,
      });

      setLastUpdated(new Date());
    } catch (e) {
      setError(
        e.message || "Unable to load financial dashboard."
      );
    } finally {
      setLoading(false);
    }
  }, [month, range.from, range.to]);

  useEffect(() => {
    load();
  }, [load]);

  const closing = data?.closing || {};
  const profit = closing.profit || {};
  const silverAdjustment = profit.silverAdjustment || {};

  const summary = data?.accounts?.summary || {};
  const silverSummary = data?.silver?.summary || {};
  const matchingSummary = data?.matching?.summary || {};
  const reportSummary = data?.reports?.summary || {};

  const accountBalances =
    data?.accounts?.accountBalances || [];

  const cashBalance =
    accountBalances.find((x) => x.account === "Cash")?.balance ?? 0;

  const bankBalance =
    accountBalances.find((x) => x.account === "Bank")?.balance ?? 0;

  const salesRows = (data?.reports?.bills || []).map((bill) => ({
    key: bill.id || bill._id || bill.billNumber,
    cells: [
      bill.billNumber || "—",
      bill.createdAt
        ? new Date(bill.createdAt).toLocaleDateString("en-IN")
        : "—",
      bill.customerName || "Walk-in",
      money(bill.netAmount),
      money(bill.amountPaid),
      money(bill.balance),
    ],
  }));

  const transactionRows = (
    data?.accounts?.transactions || []
  ).map((tx) => ({
    key: tx._id,
    cells: [
      tx.transactionDate
        ? new Date(tx.transactionDate).toLocaleDateString("en-IN")
        : "—",
      tx.category || tx.type,
      tx.person || tx.description || "—",
      tx.direction === "in" ? money(tx.amount) : "—",
      tx.direction === "out" ? money(tx.amount) : "—",
    ],
  }));

  const movementRows = (
    data?.silver?.movements || []
  ).map((m) => ({
    key: m._id,
    cells: [
      m.entryDate
        ? new Date(m.entryDate).toLocaleDateString("en-IN")
        : "—",
      m.movementType,
      m.productName || "—",
      grams(m.weight),
      m.direction === "in" ? "In" : "Out",
      m.billNumber || m.reference || "—",
    ],
  }));

  const incompleteProfit = profit.status !== "calculated";

  const assumedZero =
    closing.openingVerification?.source === "zero_start_assumption";

  return (
    <main style={styles.page}>
      <div style={styles.header}>
        <div>
          <div style={styles.eyebrow}>
            SIVAAH · OWNER CONTROL CENTRE
          </div>

          <h2 style={styles.title}>Financial Dashboard</h2>

          <p style={styles.subtitle}>
            One view of sales, purchases, silver replenishment,
            expenses, profit and closing balances.
          </p>
        </div>

        <button
          onClick={load}
          disabled={loading}
          style={styles.refresh}
        >
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      <div style={styles.toolbar}>
        <label style={styles.monthLabel}>
          Reporting month

          <input
            type="month"
            min="2026-10"
            max={localToday().slice(0, 7)}
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            style={styles.monthInput}
          />
        </label>

        <div style={styles.rangeText}>
          Period: {range.from} to {range.to}
        </div>
      </div>

      {error ? (
        <div style={styles.error}>
          <strong>Dashboard could not load.</strong>
          <br />
          {error}
          <br />
          <span style={{ fontSize: 13 }}>
            No old figures are being shown. Check the relevant API
            response before relying on this dashboard.
          </span>
        </div>
      ) : null}

      {loading ? (
        <div style={styles.info}>
          Loading financial records and calculating this month's
          position…
        </div>
      ) : null}

      {data ? (
        <>
          {assumedZero ? (
            <div style={styles.warning}>
              This first month is using your explicitly selected
              zero-start baseline (₹0 cash, ₹0 bank, 0 g silver).
              It is a system starting point, not a money transaction.
              Physical closing counts still need verification before
              the month can be formally closed.
            </div>
          ) : null}

          {incompleteProfit ? (
            <div style={styles.warning}>
              Profit is incomplete.{" "}
              {number(profit.itemsWithMissingReplacementCost)} sale
              item(s) are missing replacement cost and/or{" "}
              {Array.isArray(profit.salesWithPaymentIssues)
                ? profit.salesWithPaymentIssues.length
                : 0}{" "}
              sale payment issue(s) need attention. Do not treat the
              profit figure as final.
            </div>
          ) : null}

          {number(silverSummary.piecesWithUnknownSilverRate) > 0 ||
          number(silverSummary.piecesWithUnknownLabourRate) > 0 ? (
            <div style={styles.warning}>
              Some in-stock pieces have missing acquisition rates or
              labour rates. Inventory valuation needs review.
            </div>
          ) : null}

          <Section
            title="1. Business performance"
            subtitle="Activity during the selected month. Sales and purchase cash movements are not the same as profit."
          >
            <div style={styles.grid4}>
              <Card
                label="Sales bills"
                value={number(reportSummary.bills).toLocaleString("en-IN")}
                note={`${number(reportSummary.piecesSold)} pieces sold`}
              />

              <Card
                label="Sales billed"
                value={money(summary.billedSales)}
                note="Customer bill totals; GST-inclusive where applicable"
              />

              <Card
                label="Inventory purchased"
                value={money(summary.inventoryPurchases)}
                note="Stock purchase cash outflow; not an expense"
              />

              <Card
                label="Operating expenses"
                value={money(summary.expenses)}
                note="Expenses that reduce operating profit"
                tone="red"
              />
            </div>
          </Section>

          <Section
            title="2. Profit calculation"
            subtitle="The blueprint's replacement-cost method. Confirmed profit and estimated profit are shown separately."
          >
            <div style={styles.profitGrid}>
              <div style={styles.profitPanel}>
                <div style={styles.profitLine}>
                  <span>Sales revenue excluding GST</span>
                  <strong>{money(profit.salesRevenue)}</strong>
                </div>

                <div style={styles.profitLine}>
                  <span>Less: replacement cost of pieces sold</span>
                  <strong>− {money(profit.replacementCost)}</strong>
                </div>

                <div style={{ ...styles.profitLine, ...styles.subtotal }}>
                  <span>Operating margin</span>
                  <strong>{money(profit.operatingMargin)}</strong>
                </div>

                <div style={styles.profitLine}>
                  <span>Add: confirmed silver adjustment</span>
                  <strong>{money(silverAdjustment.confirmed)}</strong>
                </div>

                <div style={styles.profitLine}>
                  <span>Less: operating expenses</span>
                  <strong>− {money(profit.operatingExpenses)}</strong>
                </div>

                <div style={{ ...styles.profitLine, ...styles.totalLine }}>
                  <span>REAL PROFIT · CONFIRMED</span>
                  <strong>{money(profit.confirmedRealProfit)}</strong>
                </div>

                <div style={styles.profitLine}>
                  <span>Add: provisional silver adjustment (estimate)</span>
                  <strong>
                    {silverAdjustment.provisional == null
                      ? "Not available"
                      : money(silverAdjustment.provisional)}
                  </strong>
                </div>

                <div style={{ ...styles.profitLine, ...styles.estimateLine }}>
                  <span>REAL PROFIT · INCLUDING ESTIMATE</span>
                  <strong>{money(profit.estimatedRealProfit)}</strong>
                </div>

                <div style={styles.smallNote}>
                  Provisional adjustment is not confirmed profit. It
                  becomes confirmed only when replacement silver is
                  received and matched.
                </div>
              </div>

              <div style={styles.sidePanel}>
                <div style={styles.sideMetric}>
                  <span>Silver adjustment status</span>
                  <strong>{silverAdjustment.status || "—"}</strong>
                </div>

                <div style={styles.sideMetric}>
                  <span>Confirmed matched</span>
                  <strong>{grams(silverAdjustment.confirmedMatchedGrams)}</strong>
                </div>

                <div style={styles.sideMetric}>
                  <span>Sold silver still unmatched</span>
                  <strong>{grams(silverAdjustment.unmatchedSoldGrams)}</strong>
                </div>

                <div style={styles.sideMetric}>
                  <span>Matches created this month</span>
                  <strong>{number(silverAdjustment.matchesCreatedInMonth)}</strong>
                </div>

                <div style={styles.sideMetric}>
                  <span>Items missing replacement cost</span>
                  <strong>{number(profit.itemsWithMissingReplacementCost)}</strong>
                </div>

                <div style={styles.sideMetric}>
                  <span>One-time setup costs</span>
                  <strong>Not separately classified yet</strong>
                </div>

                <div style={styles.smallNote}>
                  The current transaction model does not yet separate
                  setup/one-time costs from recurring operating
                  expenses. Profit after one-time costs will remain
                  unavailable until that classification is added.
                </div>
              </div>
            </div>
          </Section>

          <Section
            title="3. Money position"
            subtitle="Opening + money movements = system closing. Current balances are lifetime balances through the latest recorded transaction."
          >
            <div style={styles.grid4}>
              <Card
                label="Opening cash"
                value={money(closing.opening?.cash)}
              />

              <Card
                label="Opening bank"
                value={money(closing.opening?.bank)}
              />

              <Card
                label="Closing cash"
                value={money(closing.closing?.cash)}
                tone={number(closing.closing?.cash) < 0 ? "red" : "green"}
              />

              <Card
                label="Closing bank"
                value={money(closing.closing?.bank)}
                tone={number(closing.closing?.bank) < 0 ? "red" : "green"}
              />
            </div>

            <div style={{ ...styles.grid4, marginTop: 12 }}>
              <Card
                label="Cash balance · all recorded history"
                value={money(cashBalance)}
              />

              <Card
                label="Bank balance · all recorded history"
                value={money(bankBalance)}
              />

              <Card
                label="Sales collections this month"
                value={money(summary.saleCollections)}
              />

              <Card
                label="Supplier payments this month"
                value={money(summary.supplierPayments)}
              />
            </div>

            <div style={styles.info}>
              Founder capital ({money(summary.capitalAdded)}) is
              funding, not revenue. Inventory purchases (
              {money(summary.inventoryPurchases)}) reduce money but
              become stock; they are not operating expenses.
            </div>
          </Section>

          <Section
            title="4. Silver position"
            subtitle="Physical stock and silver owed are different. Stock is the jewellery physically in the outlet; silver owed is sold grams not yet replenished and matched."
          >
            <div style={styles.grid4}>
              <Card
                label="Opening silver"
                value={grams(closing.opening?.silverGrams)}
              />

              <Card
                label="Silver received this month"
                value={grams(closing.movement?.silverInGrams)}
              />

              <Card
                label="Silver sold this month"
                value={grams(closing.movement?.silverOutGrams)}
              />

              <Card
                label="Closing silver"
                value={grams(closing.closing?.silverGrams)}
                tone="green"
              />
            </div>

            <div style={{ ...styles.grid4, marginTop: 12 }}>
              <Card
                label="Current physical stock"
                value={grams(silverSummary.totalWeight)}
                note={`${number(silverSummary.totalPieces)} pieces currently in stock`}
              />

              <Card
                label="Silver owed / unmatched"
                value={grams(matchingSummary.totalUnmatchedGrams)}
              />

              <Card
                label="Replacement stock available to match"
                value={grams(matchingSummary.eligibleReplacementGrams)}
              />

              <Card
                label="Weighted average silver rate in stock"
                value={
                  silverSummary.averageSilverRatePerGram == null
                    ? "—"
                    : `${money(silverSummary.averageSilverRatePerGram)}/g`
                }
              />
            </div>

            {silverSummary.reconciliationRequired ? (
              <div style={styles.error}>
                Physical stock and Silver Ledger net grams do not
                reconcile. Investigate the Jewellery Ledger before
                relying on this balance.
              </div>
            ) : (
              <div style={styles.success}>
                Physical piece stock and Silver Ledger net weight are
                currently reconciled.
              </div>
            )}
          </Section>

          <Section
            title="5. Month movement summary"
            subtitle="These are the movements that explain how the opening balances became the closing balances."
          >
            <div style={styles.grid4}>
              <Card
                label="Sales bills"
                value={number(closing.movement?.salesBills)}
              />

              <Card
                label="Sales collected"
                value={money(closing.movement?.salesCollected)}
              />

              <Card
                label="Manual transactions"
                value={number(closing.movement?.manualTransactions)}
              />

              <Card
                label="Silver ledger entries"
                value={number(closing.movement?.silverLedgerEntries)}
              />
            </div>

            {number(closing.movement?.unallocatedTransactionAmount) !== 0 ? (
              <div style={styles.error}>
                Unallocated money movements:{" "}
                {money(closing.movement?.unallocatedTransactionAmount)}.
                Fix these before closing the month.
              </div>
            ) : null}
          </Section>

          <Section
            title="6. Transaction drill-down"
            subtitle="Select a list to see the actual records behind the dashboard totals. These are read-only views of existing records."
          >
            <div style={styles.tabs}>
              <button
                onClick={() => setActiveDetail("sales")}
                style={
                  activeDetail === "sales"
                    ? styles.activeTab
                    : styles.tab
                }
              >
                Sales bills
              </button>

              <button
                onClick={() => setActiveDetail("money")}
                style={
                  activeDetail === "money"
                    ? styles.activeTab
                    : styles.tab
                }
              >
                Money transactions
              </button>

              <button
                onClick={() => setActiveDetail("silver")}
                style={
                  activeDetail === "silver"
                    ? styles.activeTab
                    : styles.tab
                }
              >
                Silver movements
              </button>
            </div>

            {activeDetail === "sales" ? (
              <Table
                headers={[
                  "Bill",
                  "Date",
                  "Customer",
                  "Bill total",
                  "Paid",
                  "Due",
                ]}
                rows={salesRows}
              />
            ) : null}

            {activeDetail === "money" ? (
              <Table
                headers={[
                  "Date",
                  "Type / category",
                  "Person / details",
                  "Money in",
                  "Money out",
                ]}
                rows={transactionRows}
              />
            ) : null}

            {activeDetail === "silver" ? (
              <Table
                headers={[
                  "Date",
                  "Movement",
                  "Product",
                  "Weight",
                  "Direction",
                  "Reference",
                ]}
                rows={movementRows}
              />
            ) : null}
          </Section>

          <div style={styles.footer}>
            Period: {range.from} to {range.to} · Last updated:{" "}
            {lastUpdated
              ? lastUpdated.toLocaleString("en-IN")
              : "—"}{" "}
            · This is a live preview; it does not close or post the
            month.
          </div>
        </>
      ) : null}
    </main>
  );
}

const styles = {
  page: {
    color: "#172033",
    padding: "8px 0 36px",
    maxWidth: 1500,
    margin: "0 auto",
  },

  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 16,
    flexWrap: "wrap",
    marginBottom: 22,
  },

  eyebrow: {
    fontSize: 11,
    letterSpacing: 2,
    fontWeight: 800,
    color: "#64748b",
    marginBottom: 8,
  },

  title: {
    fontSize: 30,
    lineHeight: 1.15,
    margin: 0,
    fontWeight: 800,
  },

  subtitle: {
    color: "#64748b",
    margin: "8px 0 0",
    fontSize: 14,
  },

  refresh: {
    border: "1px solid #d1d5db",
    background: "#fff",
    padding: "11px 18px",
    borderRadius: 10,
    cursor: "pointer",
    fontWeight: 700,
  },

  toolbar: {
    display: "flex",
    alignItems: "end",
    gap: 18,
    flexWrap: "wrap",
    background: "#fff",
    border: "1px solid #e5e7eb",
    borderRadius: 14,
    padding: 16,
    marginBottom: 20,
  },

  monthLabel: {
    display: "grid",
    gap: 6,
    fontSize: 12,
    fontWeight: 700,
    color: "#475569",
  },

  monthInput: {
    border: "1px solid #cbd5e1",
    borderRadius: 9,
    padding: "10px 12px",
    fontSize: 15,
    color: "#111827",
    minWidth: 190,
  },

  rangeText: {
    color: "#64748b",
    fontSize: 13,
    paddingBottom: 10,
  },

  section: {
    background: "#fff",
    border: "1px solid #e5e7eb",
    borderRadius: 15,
    padding: 18,
    marginBottom: 18,
  },

  sectionHeading: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 15,
  },

  sectionTitle: {
    margin: 0,
    fontSize: 18,
    fontWeight: 800,
  },

  sectionSubtitle: {
    margin: "5px 0 0",
    color: "#64748b",
    fontSize: 13,
    lineHeight: 1.5,
  },

  grid4: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))",
    gap: 12,
  },

  card: {
    background: "#fff",
    border: "1px solid #e5e7eb",
    borderRadius: 12,
    padding: 15,
    minHeight: 105,
  },

  cardLabel: {
    color: "#64748b",
    fontSize: 12,
    fontWeight: 700,
  },

  cardValue: {
    fontSize: 23,
    fontWeight: 800,
    marginTop: 10,
    overflowWrap: "anywhere",
  },

  cardNote: {
    color: "#64748b",
    fontSize: 11,
    marginTop: 7,
    lineHeight: 1.4,
  },

  profitGrid: {
    display: "grid",
    gridTemplateColumns: "minmax(0,1.5fr) minmax(260px,1fr)",
    gap: 14,
  },

  profitPanel: {
    border: "1px solid #e5e7eb",
    borderRadius: 12,
    padding: 16,
  },

  sidePanel: {
    background: "#f8fafc",
    border: "1px solid #e5e7eb",
    borderRadius: 12,
    padding: 16,
  },

  profitLine: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    padding: "10px 0",
    borderBottom: "1px solid #eef0f2",
    fontSize: 13,
  },

  subtotal: {
    fontWeight: 800,
    borderBottom: "2px solid #cbd5e1",
    fontSize: 15,
  },

  totalLine: {
    fontWeight: 900,
    fontSize: 15,
    color: "#166534",
    paddingTop: 14,
  },

  estimateLine: {
    fontWeight: 900,
    fontSize: 14,
    color: "#1d4ed8",
  },

  sideMetric: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    padding: "9px 0",
    borderBottom: "1px solid #e2e8f0",
    fontSize: 12,
  },

  smallNote: {
    color: "#64748b",
    fontSize: 11,
    lineHeight: 1.5,
    marginTop: 12,
  },

  info: {
    background: "#eff6ff",
    border: "1px solid #bfdbfe",
    color: "#1e40af",
    padding: 13,
    borderRadius: 10,
    marginBottom: 16,
    fontSize: 13,
    lineHeight: 1.5,
  },

  warning: {
    background: "#fffbeb",
    border: "1px solid #fcd34d",
    color: "#92400e",
    padding: 13,
    borderRadius: 10,
    marginBottom: 16,
    fontSize: 13,
    lineHeight: 1.5,
  },

  error: {
    background: "#fef2f2",
    border: "1px solid #fecaca",
    color: "#991b1b",
    padding: 13,
    borderRadius: 10,
    marginBottom: 16,
    fontSize: 13,
    lineHeight: 1.5,
  },

  success: {
    background: "#f0fdf4",
    border: "1px solid #bbf7d0",
    color: "#166534",
    padding: 13,
    borderRadius: 10,
    marginTop: 12,
    fontSize: 13,
  },

  tabs: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
    marginBottom: 12,
  },

  tab: {
    background: "#fff",
    border: "1px solid #d1d5db",
    padding: "9px 13px",
    borderRadius: 9,
    cursor: "pointer",
  },

  activeTab: {
    background: "#111827",
    color: "#fff",
    border: "1px solid #111827",
    padding: "9px 13px",
    borderRadius: 9,
    cursor: "pointer",
  },

  table: {
    width: "100%",
    borderCollapse: "collapse",
    minWidth: 650,
    fontSize: 12,
  },

  th: {
    textAlign: "left",
    color: "#64748b",
    padding: "11px 10px",
    borderBottom: "1px solid #e5e7eb",
    whiteSpace: "nowrap",
  },

  td: {
    padding: "12px 10px",
    borderBottom: "1px solid #f1f5f9",
    verticalAlign: "top",
  },

  footer: {
    color: "#64748b",
    fontSize: 11,
    textAlign: "right",
    padding: "4px 2px 16px",
  },
};
