"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import "./sales-bills.css";

const money = (value) =>
  Number(value || 0).toLocaleString("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  });

function dateValue(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

function displayDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  return date.toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  });
}

function getSaleProfit(sale) {
  if (sale.profitAtSale != null) {
    return Number(sale.profitAtSale) || 0;
  }
  if (sale.totalCostAtSale != null) {
    return (
      Number(sale.netAmount || 0) -
      Number(sale.totalCostAtSale || 0) -
      Number(sale.returnedProfitReversed || 0)
    );
  }
  return 0;
}

function getSaleWeight(sale) {
  if (!Array.isArray(sale.items)) return 0;
  return sale.items.reduce(
    (sum, item) => (item.isReplaced ? sum : sum + (Number(item.weight) || 0)),
    0
  );
}

export default function SalesBillsPage() {
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [search, setSearch] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [customerFilter, setCustomerFilter] = useState("");
  const [salespersonFilter, setSalespersonFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortBy, setSortBy] = useState("newest");
  const [deletingId, setDeletingId] = useState("");

  const loadSales = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/admin/sales-bills", {
        cache: "no-store",
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Could not load bills.");
      }

      setSales(data.sales || []);
    } catch (err) {
      setError(err.message || "Could not load bills.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSales();
  }, [loadSales]);

  const customers = useMemo(() => {
    return [
      ...new Set(
        sales.map((sale) => sale.customerSnapshot?.name || "Walk-in Customer")
      ),
    ].sort((a, b) => a.localeCompare(b));
  }, [sales]);

  const salespersons = useMemo(() => {
    return [
      ...new Set(sales.map((sale) => sale.salespersonName?.trim()).filter(Boolean)),
    ].sort((a, b) => a.localeCompare(b));
  }, [sales]);

  const filteredSales = useMemo(() => {
    const query = search.trim().toLowerCase();

    const result = sales.filter((sale) => {
      const customer = sale.customerSnapshot?.name || "Walk-in Customer";
      const mobile = sale.customerSnapshot?.whatsappNumber || "";
      const billNumber = sale.billNumber || "";
      const salesperson = sale.salespersonName || "";
      const items = (sale.items || []).map((item) => item.name || "").join(" ");

      const matchesSearch =
        !query ||
        customer.toLowerCase().includes(query) ||
        mobile.toLowerCase().includes(query) ||
        billNumber.toLowerCase().includes(query) ||
        salesperson.toLowerCase().includes(query) ||
        items.toLowerCase().includes(query);

      const saleDate = dateValue(sale.createdAt);
      const matchesFrom = !fromDate || saleDate >= fromDate;
      const matchesTo = !toDate || saleDate <= toDate;

      const matchesCustomer =
        !customerFilter || customer === customerFilter;

      const matchesSalesperson =
        !salespersonFilter || salesperson === salespersonFilter;

      const matchesStatus =
        statusFilter === "all" || (sale.status || "completed") === statusFilter;

      return (
        matchesSearch &&
        matchesFrom &&
        matchesTo &&
        matchesCustomer &&
        matchesSalesperson &&
        matchesStatus
      );
    });

    result.sort((a, b) => {
      if (sortBy === "oldest") {
        return new Date(a.createdAt) - new Date(b.createdAt);
      }

      if (sortBy === "amountHigh") {
        return Number(b.netAmount || 0) - Number(a.netAmount || 0);
      }

      if (sortBy === "amountLow") {
        return Number(a.netAmount || 0) - Number(b.netAmount || 0);
      }

      if (sortBy === "profitHigh") {
        return getSaleProfit(b) - getSaleProfit(a);
      }

      if (sortBy === "profitLow") {
        return getSaleProfit(a) - getSaleProfit(b);
      }

      if (sortBy === "weightHigh") {
        return getSaleWeight(b) - getSaleWeight(a);
      }

      if (sortBy === "weightLow") {
        return getSaleWeight(a) - getSaleWeight(b);
      }

      return new Date(b.createdAt) - new Date(a.createdAt);
    });

    return result;
  }, [
    sales,
    search,
    fromDate,
    toDate,
    customerFilter,
    salespersonFilter,
    statusFilter,
    sortBy,
  ]);

  const activeFilteredSales = useMemo(
    () =>
      filteredSales.filter(
        (sale) => (sale.status || "completed") !== "cancelled"
      ),
    [filteredSales]
  );

  const totalAmount = activeFilteredSales.reduce(
    (sum, sale) => sum + Number(sale.netAmount || 0),
    0
  );

  const totalProfit = activeFilteredSales.reduce(
    (sum, sale) => sum + getSaleProfit(sale),
    0
  );

  const totalSilverWeight = activeFilteredSales.reduce(
    (sum, sale) => sum + getSaleWeight(sale),
    0
  );

  const totalPiecesSold = activeFilteredSales.reduce(
    (sum, sale) =>
      sum +
      (Array.isArray(sale.items)
        ? sale.items.filter((it) => !it.isReplaced).length
        : 0),
    0
  );

  const overallMarginPct =
    totalAmount > 0 ? (totalProfit / totalAmount) * 100 : 0;

  async function deleteBill(sale) {
    const billNumber = sale.billNumber || sale._id;

    const confirmed = window.confirm(
      `Permanently delete bill ${billNumber}?\n\nThe bill record will be removed and its jewellery stock will be restored. This action cannot be undone.`
    );

    if (!confirmed) return;

    const deleteCode = window.prompt(
      `Enter the admin delete code to delete bill ${billNumber}:`
    );

    if (deleteCode === null || !deleteCode.trim()) return;

    setDeletingId(sale._id);
    setError("");
    setMessage("");

    try {
      const response = await fetch(
        `/api/admin/sales-bills/${encodeURIComponent(sale._id)}`,
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ deleteCode }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Could not delete bill.");
      }

      setSales((previous) =>
        previous.filter((item) => item._id !== sale._id)
      );
      setMessage(data.message || "Bill deleted successfully.");
    } catch (err) {
      setError(err.message || "Could not delete bill.");
    } finally {
      setDeletingId("");
    }
  }

  function clearFilters() {
    setSearch("");
    setFromDate("");
    setToDate("");
    setCustomerFilter("");
    setSalespersonFilter("");
    setStatusFilter("all");
    setSortBy("newest");
  }

  return (
    <main className="sales-bills-page">
      <header className="sb-header">
        <div>
          <div className="sb-eyebrow">SIVAAH ADMINISTRATION</div>
          <h1>Sales &amp; Bills</h1>
          <p>Search, review and manage outlet invoices.</p>
        </div>

        <div className="sb-header-actions">
          <button type="button" className="sb-button sb-secondary" onClick={loadSales}>
            ↻ Refresh
          </button>
          <Link href="/admin" className="sb-button sb-secondary">
            ← Admin Home
          </Link>
        </div>
      </header>

      {error && <div className="sb-alert sb-error">{error}</div>}
      {message && <div className="sb-alert sb-success">{message}</div>}

      <section className="sb-summary">
        <div>
          <span>Filtered Bills</span>
          <strong>{filteredSales.length.toLocaleString("en-IN")}</strong>
          <small>{totalPiecesSold.toLocaleString("en-IN")} pieces sold</small>
        </div>
        <div>
          <span>Total Silver Sold</span>
          <strong>
            {totalSilverWeight.toLocaleString("en-IN", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 3,
            })}{" "}
            g
          </strong>
          <small>
            {totalSilverWeight >= 1000
              ? `${(totalSilverWeight / 1000).toFixed(3)} kg net silver`
              : "Net weight of sold items"}
          </small>
        </div>
        <div>
          <span>Total Bill Amount</span>
          <strong>{money(totalAmount)}</strong>
          <small>Sum of filtered invoice totals</small>
        </div>
        <div>
          <span>Total Profit</span>
          <strong style={{ color: totalProfit >= 0 ? "#15803d" : "#b91c1c" }}>
            {money(totalProfit)}
          </strong>
          <small>{overallMarginPct.toFixed(1)}% overall margin</small>
        </div>
      </section>

      <section className="sb-filter-panel">
        <div className="sb-filter-heading">
          <div>
            <h2>Find bills</h2>
            <p>Search by customer, mobile, bill number or item name.</p>
          </div>
          <button
            type="button"
            className="sb-text-button"
            onClick={clearFilters}
          >
            Clear filters
          </button>
        </div>

        <div className="sb-filters">
          <label className="sb-search-field">
            Search
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Customer, mobile, bill no..."
            />
          </label>

          <label>
            From date
            <input
              type="date"
              value={fromDate}
              max={toDate || undefined}
              onChange={(event) => setFromDate(event.target.value)}
            />
          </label>

          <label>
            To date
            <input
              type="date"
              value={toDate}
              min={fromDate || undefined}
              onChange={(event) => setToDate(event.target.value)}
            />
          </label>

          <label>
            Customer
            <select
              value={customerFilter}
              onChange={(event) => setCustomerFilter(event.target.value)}
            >
              <option value="">All customers</option>
              {customers.map((customer) => (
                <option key={customer} value={customer}>
                  {customer}
                </option>
              ))}
            </select>
          </label>

          <label>
            Salesperson
            <select
              value={salespersonFilter}
              onChange={(event) => setSalespersonFilter(event.target.value)}
            >
              <option value="">All salespersons</option>
              {salespersons.map((person) => (
                <option key={person} value={person}>
                  {person}
                </option>
              ))}
            </select>
          </label>

          <label>
            Bill status
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              <option value="all">All statuses</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </label>

          <label>
            Sort by
            <select
              value={sortBy}
              onChange={(event) => setSortBy(event.target.value)}
            >
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="amountHigh">Highest amount</option>
              <option value="amountLow">Lowest amount</option>
              <option value="profitHigh">Highest profit</option>
              <option value="profitLow">Lowest profit</option>
              <option value="weightHigh">Highest weight</option>
              <option value="weightLow">Lowest weight</option>
            </select>
          </label>
        </div>
      </section>

      <section className="sb-table-panel">
        <div className="sb-table-heading">
          <h2>Bill records</h2>
          <span>{filteredSales.length} results</span>
        </div>

        {loading ? (
          <div className="sb-empty">Loading bills...</div>
        ) : filteredSales.length === 0 ? (
          <div className="sb-empty">
            <strong>No bills found</strong>
            <p>Try changing your search or filters.</p>
          </div>
        ) : (
          <div className="sb-table-scroll">
            <table className="sb-table">
              <thead>
                <tr>
                  <th>Bill / Date</th>
                  <th>Customer</th>
                  <th>Items &amp; Weight</th>
                  <th>Salesperson</th>
                  <th>Bill Amount</th>
                  <th>Profit</th>
                  <th>Paid / Balance</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredSales.map((sale) => {
                  const customer =
                    sale.customerSnapshot?.name || "Walk-in Customer";
                  const items = sale.items || [];
                  const status = sale.status || "completed";
                  const net = Number(sale.netAmount || 0);
                  const profit = getSaleProfit(sale);
                  const marginPct = net > 0 ? (profit / net) * 100 : 0;
                  const billWeight = getSaleWeight(sale);

                  return (
                    <tr key={sale._id}>
                      <td>
                        <strong>{sale.billNumber || "—"}</strong>
                        <small>{displayDate(sale.createdAt)}</small>
                      </td>
                      <td>
                        <strong>{customer}</strong>
                        <small>
                          {sale.customerSnapshot?.whatsappNumber || "No mobile"}
                        </small>
                      </td>
                      <td>
                        <strong>
                          {items.length} item(s) • {billWeight.toFixed(3)} g
                        </strong>
                        <small>
                          {items
                            .slice(0, 2)
                            .map((item) => item.name)
                            .filter(Boolean)
                            .join(", ")}
                          {items.length > 2 ? "…" : ""}
                        </small>
                      </td>
                      <td>{sale.salespersonName || "—"}</td>
                      <td>
                        <strong>{money(net)}</strong>
                        {Number(sale.discountAmount || 0) > 0 && (
                          <small>
                            Discount: {money(sale.discountAmount)}
                          </small>
                        )}
                      </td>
                      <td>
                        <strong
                          style={{
                            color: profit >= 0 ? "#15803d" : "#b91c1c",
                          }}
                        >
                          {money(profit)}
                        </strong>
                        <small>{marginPct.toFixed(1)}% margin</small>
                      </td>
                      <td>
                        <strong>{money(sale.amountPaid)}</strong>
                        <small>
                          Due: {money(sale.balance)}
                        </small>
                      </td>
                      <td>
                        <span className={`sb-status sb-status-${status}`}>
                          {status}
                        </span>
                      </td>
                      <td>
                        <div className="sb-row-actions">
                          <Link
                            href={`/sale/invoice/${encodeURIComponent(sale._id)}`}
                            className="sb-view-link"
                          >
                            View bill
                          </Link>
                          <button
                            type="button"
                            className="sb-delete-button"
                            disabled={deletingId === sale._id}
                            onClick={() => deleteBill(sale)}
                          >
                            {deletingId === sale._id ? "Deleting..." : "Delete"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}