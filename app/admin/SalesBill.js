
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";

function money(value) {
  if (value == null || !Number.isFinite(Number(value))) return "—";

  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  }).format(Number(value));
}

function getCustomer(sale) {
  return sale.customerSnapshot || {};
}

function getCustomerName(sale) {
  return getCustomer(sale).name || "Walk-in Customer";
}

function getMobile(sale) {
  return getCustomer(sale).whatsappNumber || "";
}

function getBillAmount(sale) {
  return Number(sale.netAmount ?? sale.totalAmount ?? 0);
}

function getPaidAmount(sale) {
  return Number(
    sale.amountPaid ??
      sale.paymentSummary?.amountPaid ??
      sale.paymentSummary?.paid ??
      0
  );
}

function getBalance(sale) {
  const savedBalance = sale.balance;

  if (savedBalance != null) return Number(savedBalance);

  return Math.max(0, getBillAmount(sale) - getPaidAmount(sale));
}

function getSalesperson(sale) {
  if (sale.salespersonName) return sale.salespersonName;

  const names = [
    ...new Set(
      (sale.items || [])
        .map((item) => item.salespersonName)
        .filter(Boolean)
    ),
  ];

  return names.join(", ") || "Not assigned";
}

function getDate(sale) {
  const value = sale.createdAt || sale.saleDate || sale.date;

  if (!value) return null;

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? null : date;
}

function displayDate(sale) {
  const date = getDate(sale);

  if (!date) return "—";

  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function localDate(date) {
  if (!date) return "";

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export default function SalesBills() {
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [search, setSearch] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [customerFilter, setCustomerFilter] = useState("");
  const [salespersonFilter, setSalespersonFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [sortBy, setSortBy] = useState("newest");

  const [deletingId, setDeletingId] = useState("");

  const loadSales = useCallback(async () => {
    setLoading(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch("/api/admin/sales-bills", {
        cache: "no-store",
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Bills load nahi ho paaye.");
      }

      setSales(Array.isArray(data.sales) ? data.sales : []);
    } catch (err) {
      setError(err.message || "Bills load nahi ho paaye.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSales();
  }, [loadSales]);

  const customers = useMemo(() => {
    const map = new Map();

    sales.forEach((sale) => {
      const name = getCustomerName(sale);
      const mobile = getMobile(sale);
      const key = mobile || name;

      if (!map.has(key)) {
        map.set(key, { key, name, mobile });
      }
    });

    return [...map.values()].sort((a, b) =>
      a.name.localeCompare(b.name)
    );
  }, [sales]);

  const salespersons = useMemo(
    () =>
      [...new Set(sales.map(getSalesperson))]
        .filter((name) => name !== "Not assigned")
        .sort((a, b) => a.localeCompare(b)),
    [sales]
  );

  const filteredSales = useMemo(() => {
    const query = search.trim().toLowerCase();

    const result = sales.filter((sale) => {
      const customer = getCustomer(sale);
      const items = sale.items || [];

      const searchableText = [
        sale.billNumber,
        sale._id,
        customer.name,
        customer.whatsappNumber,
        customer.address,
        getSalesperson(sale),
        ...items.flatMap((item) => [
          item.name,
          item.sku,
          item.batchId,
        ]),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      if (query && !searchableText.includes(query)) return false;

      const date = getDate(sale);

      if (fromDate) {
        if (!date || localDate(date) < fromDate) return false;
      }

      if (toDate) {
        if (!date || localDate(date) > toDate) return false;
      }

      if (customerFilter) {
        const customerKey = getMobile(sale) || getCustomerName(sale);

        if (customerKey !== customerFilter) return false;
      }

      if (
        salespersonFilter &&
        getSalesperson(sale) !== salespersonFilter
      ) {
        return false;
      }

      if (statusFilter && (sale.status || "completed") !== statusFilter) {
        return false;
      }

      return true;
    });

    result.sort((a, b) => {
      if (sortBy === "oldest") {
        return (getDate(a)?.getTime() || 0) -
          (getDate(b)?.getTime() || 0);
      }

      if (sortBy === "amount-high") {
        return getBillAmount(b) - getBillAmount(a);
      }

      if (sortBy === "amount-low") {
        return getBillAmount(a) - getBillAmount(b);
      }

      return (getDate(b)?.getTime() || 0) -
        (getDate(a)?.getTime() || 0);
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

  const summary = useMemo(() => {
    return filteredSales.reduce(
      (totals, sale) => {
        totals.count += 1;
        totals.amount += getBillAmount(sale);
        totals.paid += getPaidAmount(sale);
        totals.balance += getBalance(sale);
        return totals;
      },
      { count: 0, amount: 0, paid: 0, balance: 0 }
    );
  }, [filteredSales]);

  function clearFilters() {
    setSearch("");
    setFromDate("");
    setToDate("");
    setCustomerFilter("");
    setSalespersonFilter("");
    setStatusFilter("");
    setSortBy("newest");
  }

  async function deleteBill(sale) {
    const billLabel = sale.billNumber || sale._id;

    const confirmed = window.confirm(
      `Are you sure you want to delete bill ${billLabel}?\n\n` +
        "This action will remove the bill and attempt to restore its sold stock. " +
        "Please verify the bill and stock before proceeding."
    );

    if (!confirmed) return;

    const deleteCode = window.prompt(
      "Enter the admin bill deletion code:"
    );

    if (deleteCode === null) return;

    if (!deleteCode.trim()) {
      setError("Deletion code is required.");
      return;
    }

    setDeletingId(sale._id);
    setError("");
    setMessage("");

    try {
      const response = await fetch(
        `/api/admin/sales-bills/${encodeURIComponent(sale._id)}`,
        {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ deleteCode }),
        }
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Bill delete nahi hua.");
      }

      setSales((previous) =>
        previous.filter((item) => item._id !== sale._id)
      );

      setMessage(
        data.message || `Bill ${billLabel} deleted successfully.`
      );
    } catch (err) {
      setError(err.message || "Bill delete nahi hua.");
    } finally {
      setDeletingId("");
    }
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-500">
            Sales & Finance
          </p>

          <h2 className="mt-1 text-2xl font-bold">Sales & Bills</h2>

          <p className="mt-1 text-sm text-gray-500">
            Manage outlet bills, customer purchases, salesperson sales,
            payments and outstanding balances.
          </p>
        </div>

        <button
          type="button"
          onClick={loadSales}
          disabled={loading || Boolean(deletingId)}
          className="rounded-lg border px-4 py-2.5 text-sm font-medium disabled:opacity-50"
        >
          {loading ? "Refreshing..." : "Refresh Bills"}
        </button>
      </div>

      {/* Alerts */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {message && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">
          {message}
        </div>
      )}

      {/* Summary cards: calculated from the active filters */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          label="Matching Bills"
          value={summary.count}
          note="Based on current filters"
        />

        <SummaryCard
          label="Total Bill Amount"
          value={money(summary.amount)}
          note="Net amount of matching bills"
        />

        <SummaryCard
          label="Amount Collected"
          value={money(summary.paid)}
          note="Recorded payments"
        />

        <SummaryCard
          label="Outstanding Balance"
          value={money(summary.balance)}
          note="Recorded balance of matching bills"
        />
      </div>

      {/* Filters */}
      <div className="space-y-4 rounded-xl border bg-white p-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          <label className="text-sm font-medium">
            Search bills
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Bill no., customer, mobile, product, SKU..."
              className="mt-1 w-full rounded-lg border px-3 py-3 font-normal"
            />
          </label>

          <label className="text-sm font-medium">
            Customer
            <select
              value={customerFilter}
              onChange={(event) => setCustomerFilter(event.target.value)}
              className="mt-1 w-full rounded-lg border bg-white px-3 py-3 font-normal"
            >
              <option value="">All customers</option>
              {customers.map((customer) => (
                <option key={customer.key} value={customer.key}>
                  {customer.name}
                  {customer.mobile ? ` — ${customer.mobile}` : ""}
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm font-medium">
            Salesperson
            <select
              value={salespersonFilter}
              onChange={(event) =>
                setSalespersonFilter(event.target.value)
              }
              className="mt-1 w-full rounded-lg border bg-white px-3 py-3 font-normal"
            >
              <option value="">All salespersons</option>
              {salespersons.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm font-medium">
            From date
            <input
              type="date"
              value={fromDate}
              max={toDate || undefined}
              onChange={(event) => setFromDate(event.target.value)}
              className="mt-1 w-full rounded-lg border px-3 py-3 font-normal"
            />
          </label>

          <label className="text-sm font-medium">
            To date
            <input
              type="date"
              value={toDate}
              min={fromDate || undefined}
              onChange={(event) => setToDate(event.target.value)}
              className="mt-1 w-full rounded-lg border px-3 py-3 font-normal"
            />
          </label>

          <label className="text-sm font-medium">
            Bill status
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="mt-1 w-full rounded-lg border bg-white px-3 py-3 font-normal"
            >
              <option value="">All statuses</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
              <option value="refunded">Refunded</option>
            </select>
          </label>
        </div>

        <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-end sm:justify-between">
          <label className="text-sm font-medium sm:w-64">
            Sort bills
            <select
              value={sortBy}
              onChange={(event) => setSortBy(event.target.value)}
              className="mt-1 w-full rounded-lg border bg-white px-3 py-3 font-normal"
            >
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="amount-high">Highest amount</option>
              <option value="amount-low">Lowest amount</option>
            </select>
          </label>

          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm text-gray-500">
              Showing{" "}
              <span className="font-semibold text-gray-900">
                {filteredSales.length}
              </span>{" "}
              of {sales.length} bills
            </p>

            <button
              type="button"
              onClick={clearFilters}
              className="rounded-lg border px-4 py-2.5 text-sm font-medium hover:bg-gray-50"
            >
              Clear Filters
            </button>
          </div>
        </div>
      </div>

      {/* Bill list */}
      {loading ? (
        <div className="rounded-xl border p-10 text-center text-gray-500">
          Loading outlet bills...
        </div>
      ) : filteredSales.length === 0 ? (
        <div className="rounded-xl border p-10 text-center text-gray-500">
          {sales.length === 0
            ? "No bills found in the database."
            : "No bills match your search or filters."}
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden overflow-x-auto rounded-xl border bg-white lg:block">
            <table className="w-full min-w-[1150px] text-left text-sm">
              <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-4 py-3">Bill / Date</th>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Items</th>
                  <th className="px-4 py-3">Salesperson</th>
                  <th className="px-4 py-3 text-right">Bill Amount</th>
                  <th className="px-4 py-3 text-right">Paid</th>
                  <th className="px-4 py-3 text-right">Balance</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>

              <tbody className="divide-y">
                {filteredSales.map((sale) => (
                  <tr key={sale._id} className="align-top">
                    <td className="px-4 py-4">
                      <p className="font-semibold">
                        {sale.billNumber || "Bill"}
                      </p>
                      <p className="mt-1 text-xs text-gray-500">
                        {displayDate(sale)}
                      </p>
                    </td>

                    <td className="px-4 py-4">
                      <p className="font-medium">{getCustomerName(sale)}</p>
                      <p className="mt-1 text-xs text-gray-500">
                        {getMobile(sale) || "No mobile"}
                      </p>
                    </td>

                    <td className="px-4 py-4">
                      <p>{(sale.items || []).length} item(s)</p>
                      <p className="mt-1 max-w-52 text-xs text-gray-500">
                        {(sale.items || [])
                          .map((item) => item.name)
                          .filter(Boolean)
                          .join(", ") || "—"}
                      </p>
                    </td>

                    <td className="px-4 py-4">
                      {getSalesperson(sale)}
                    </td>

                    <AmountCell value={getBillAmount(sale)} />
                    <AmountCell value={getPaidAmount(sale)} />
                    <AmountCell value={getBalance(sale)} />

                    <td className="px-4 py-4">
                      <StatusBadge status={sale.status || "completed"} />
                    </td>

                    <td className="px-4 py-4">
                      <div className="flex flex-col items-start gap-2">
                        <Link
                          href={`/sale/invoice/${sale._id}`}
                          className="font-medium text-blue-700 hover:underline"
                        >
                          View Bill →
                        </Link>

                        <button
                          type="button"
                          onClick={() => deleteBill(sale)}
                          disabled={Boolean(deletingId)}
                          className="text-sm font-medium text-red-600 hover:underline disabled:opacity-50"
                        >
                          {deletingId === sale._id
                            ? "Deleting..."
                            : "Delete Bill"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile and tablet cards */}
          <div className="grid grid-cols-1 gap-3 lg:hidden">
            {filteredSales.map((sale) => (
              <article
                key={sale._id}
                className="space-y-4 rounded-xl border bg-white p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="break-words font-bold">
                      {sale.billNumber || "Bill"}
                    </h3>
                    <p className="mt-1 text-xs text-gray-500">
                      {displayDate(sale)}
                    </p>
                  </div>

                  <StatusBadge status={sale.status || "completed"} />
                </div>

                <div>
                  <p className="font-semibold">{getCustomerName(sale)}</p>
                  <p className="text-sm text-gray-500">
                    {getMobile(sale) || "No mobile number"}
                  </p>
                </div>

                <div className="rounded-lg bg-gray-50 p-3 text-sm">
                  <p className="font-medium">
                    {(sale.items || []).length} item(s)
                  </p>
                  <p className="mt-1 break-words text-xs text-gray-500">
                    {(sale.items || [])
                      .map((item) => item.name)
                      .filter(Boolean)
                      .join(", ") || "No item details"}
                  </p>
                  <p className="mt-2 text-xs text-gray-500">
                    Salesperson: {getSalesperson(sale)}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <MobileAmount
                    label="Bill Amount"
                    value={getBillAmount(sale)}
                  />
                  <MobileAmount
                    label="Paid"
                    value={getPaidAmount(sale)}
                  />
                  <MobileAmount
                    label="Balance"
                    value={getBalance(sale)}
                  />
                </div>

                <div className="flex flex-wrap items-center gap-4 border-t pt-3">
                  <Link
                    href={`/sale/invoice/${sale._id}`}
                    className="font-medium text-blue-700 hover:underline"
                  >
                    View Bill →
                  </Link>

                  <button
                    type="button"
                    onClick={() => deleteBill(sale)}
                    disabled={Boolean(deletingId)}
                    className="text-sm font-medium text-red-600 hover:underline disabled:opacity-50"
                  >
                    {deletingId === sale._id
                      ? "Deleting..."
                      : "Delete Bill"}
                  </button>
                </div>
              </article>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function SummaryCard({ label, value, note }) {
  return (
    <div className="rounded-xl border bg-white p-4">
      <p className="text-sm text-gray-500">{label}</p>
      <p className="mt-2 break-words text-xl font-bold">{value}</p>
      <p className="mt-1 text-xs text-gray-500">{note}</p>
    </div>
  );
}

function AmountCell({ value }) {
  return (
    <td className="px-4 py-4 text-right font-semibold tabular-nums">
      {money(value)}
    </td>
  );
}

function MobileAmount({ label, value }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="mt-1 break-words font-semibold tabular-nums">
        {money(value)}
      </p>
    </div>
  );
}

function StatusBadge({ status }) {
  const styles = {
    completed: "bg-green-50 text-green-700",
    cancelled: "bg-red-50 text-red-700",
    refunded: "bg-amber-50 text-amber-800",
  };

  const normalized = String(status || "completed").toLowerCase();

  return (
    <span
      className={`inline-block rounded-full px-2.5 py-1 text-xs font-medium ${
        styles[normalized] || "bg-gray-100 text-gray-700"
      }`}
    >
      {normalized.charAt(0).toUpperCase() + normalized.slice(1)}
    </span>
  );
}
