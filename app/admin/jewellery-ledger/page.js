"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

const money = (value) =>
  value == null || !Number.isFinite(Number(value))
    ? "—"
    : `₹${Number(value).toLocaleString("en-IN", {
        maximumFractionDigits: 2,
        minimumFractionDigits: 2,
      })}`;

const grams = (value) =>
  value == null || !Number.isFinite(Number(value))
    ? "—"
    : `${Number(value).toLocaleString("en-IN", {
        minimumFractionDigits: 3,
        maximumFractionDigits: 3,
      })} g`;

const dateText = (entry) => {
  if (!entry) return "—";

  const entryDate = entry.entryDate
    ? new Date(entry.entryDate)
    : null;

  const isValidEntryDate =
    entryDate && !Number.isNaN(entryDate.getTime());

  const isDateOnly =
    isValidEntryDate &&
    entryDate.getUTCHours() === 0 &&
    entryDate.getUTCMinutes() === 0 &&
    entryDate.getUTCSeconds() === 0;

  // Use creation timestamp when entryDate has no time.
  const date = new Date(
    isDateOnly
      ? entry.createdAt || entry.entryDate
      : isValidEntryDate
        ? entry.entryDate
        : entry.createdAt
  );

  if (Number.isNaN(date.getTime())) return "—";

  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Kolkata",
  });
};

const movementLabels = {
  opening_stock: "Opening stock",
  stock_in: "Stock received",
  sale: "Sale",
  customer_return: "Customer return",
  damage: "Damage",
  loss: "Loss",
  adjustment_in: "Stock adjustment (+)",
  adjustment_out: "Stock adjustment (-)",
};

export default function JewelleryLedgerPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [movement, setMovement] = useState("all");

  const loadLedger = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/admin/jewellery-ledger", {
        method: "GET",
        cache: "no-store",
      });

      const result = await response.json();

      if (!response.ok || result.success === false) {
        throw new Error(
          result.message || "Could not load jewellery ledger."
        );
      }

      setData(result);
    } catch (err) {
      setError(err.message || "Could not load jewellery ledger.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadLedger();
  }, [loadLedger]);

  const entries = useMemo(() => {
  const rows = Array.isArray(data?.movements)
    ? data.movements
    : Array.isArray(data?.entries)
      ? data.entries
      : Array.isArray(data?.ledger)
        ? data.ledger
        : [];

  const query = search.trim().toLowerCase();

  return rows
    .filter((entry) => {
      const matchesMovement =
        movement === "all" ||
        entry.movementType === movement;

      const searchable = [
        entry.productName,
        entry.sku,
        entry.batchId,
        entry.billNumber,
        entry.reason,
        entry.reference,
        entry.pieceId,
        entry.saleId,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return matchesMovement &&
        (!query || searchable.includes(query));
    })
    .sort((a, b) => {
      const dateA = new Date(
        a.entryDate || a.createdAt || 0
      ).getTime();

      const dateB = new Date(
        b.entryDate || b.createdAt || 0
      ).getTime();

      if (dateB !== dateA) return dateB - dateA;

      return (
        new Date(b.createdAt || 0).getTime() -
        new Date(a.createdAt || 0).getTime()
      );
    });
}, [data, search, movement]);

  const summary = data?.summary || {};

  const exportCsv = () => {
    const headers = [
      "Date",
      "Movement",
      "Direction",
      "Product",
      "SKU",
      "Batch",
      "Piece ID",
      "Weight (g)",
      "Silver rate/g",
      "Labour/g",
      "Actual acquisition cost",
      "Calculated source cost",
      "Bill/reference",
      "Reason",
    ];

    const cell = (value) =>
      `"${String(value ?? "").replaceAll('"', '""')}"`;

    const rows = entries.map((entry) => [
      dateText(entry),
      movementLabels[entry.movementType] || entry.movementType,
      entry.direction,
      entry.productName,
      entry.sku,
      entry.batchId,
      entry.pieceId,
      entry.weight,
      entry.sourceSilverRate,
      entry.labourPerGram,
      entry.actualAcquisitionCost,
      entry.calculatedSourceCost,
      entry.billNumber || entry.reference,
      entry.reason,
    ]);

    const csv = [headers, ...rows]
      .map((row) => row.map(cell).join(","))
      .join("\r\n");

    const url = URL.createObjectURL(
      new Blob(["\uFEFF" + csv], {
        type: "text/csv;charset=utf-8;",
      })
    );

    const link = document.createElement("a");
    link.href = url;
    link.download = "sivaah-jewellery-ledger.csv";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const cards = [
    {
      label: "Pieces currently in stock",
      value: summary.totalPieces ?? "—",
    },
    {
      label: "Current stock weight",
      value: grams(summary.totalWeight),
    },
    {
      label: "Average silver rate / gram",
      value:
        summary.averageSilverRatePerGram == null
          ? "Not available"
          : `${money(summary.averageSilverRatePerGram)}/g`,
    },
    {
      label: "Average labour rate / gram",
      value:
        summary.averageLabourPerGram == null
          ? "Not available"
          : `${money(summary.averageLabourPerGram)}/g`,
    },
  ];

  return (
    <main className="min-h-screen bg-gray-50 p-4 text-gray-900 sm:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <p className="text-xs font-semibold tracking-[0.2em] text-gray-500">
              SIVAAH · OUTLET CONTROL CENTRE
            </p>

            <h1 className="mt-2 text-3xl font-bold">
              Jewellery & Silver Ledger
            </h1>

            <p className="mt-1 text-sm text-gray-500">
              Track stock movements, current silver weight and average
              silver acquisition rates.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={loadLedger}
              disabled={loading}
              className="rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm font-medium disabled:opacity-50"
            >
              {loading ? "Refreshing..." : "Refresh"}
            </button>

            <button
              onClick={exportCsv}
              disabled={!entries.length}
              className="rounded-xl bg-gray-900 px-4 py-3 text-sm font-semibold text-white disabled:opacity-40"
            >
              Export CSV
            </button>
          </div>
        </header>

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {cards.map((item) => (
            <div
              key={item.label}
              className="rounded-2xl border border-gray-200 bg-white p-5"
            >
              <p className="text-sm text-gray-500">{item.label}</p>
              <p className="mt-3 break-words text-2xl font-bold">
                {item.value}
              </p>
            </div>
          ))}
        </section>

        {Number(summary.piecesWithUnknownSilverRate || 0) > 0 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <strong>
              {summary.piecesWithUnknownSilverRate} in-stock piece(s)
            </strong>{" "}
            have no usable silver acquisition rate. The average is
            calculated only from pieces with known rates.
          </div>
        )}

        {Number(summary.piecesWithUnknownLabourRate || 0) > 0 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            {summary.piecesWithUnknownLabourRate} in-stock piece(s) have
            no usable labour rate. The labour average excludes those pieces.
          </div>
        )}

        {summary.reconciliationRequired && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            Physical stock weight and ledger net weight do not match.
            Reconcile opening stock and historical movements before relying
            on the ledger balance.
            <div className="mt-2 font-medium">
              Physical stock: {grams(summary.totalWeight)} · Ledger balance:{" "}
              {grams(summary.ledgerNetWeight)}
            </div>
          </div>
        )}

        <section className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-6">
          <div className="mb-4 flex flex-col gap-3 md:flex-row">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search product, SKU, batch or bill..."
              className="min-w-0 flex-1 rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:border-gray-900"
            />

            <select
              value={movement}
              onChange={(event) => setMovement(event.target.value)}
              className="rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm"
            >
              <option value="all">All movements</option>
              {Object.entries(movementLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <div className="mb-3 text-sm text-gray-500">
            {loading ? "Loading ledger..." : `${entries.length} ledger entries`}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[1200px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                  <th className="px-3 py-3">Date</th>
                  <th className="px-3 py-3">Movement</th>
                  <th className="px-3 py-3">Direction</th>
                  <th className="px-3 py-3">Product / SKU</th>
                  <th className="px-3 py-3">Batch</th>
                  <th className="px-3 py-3">Weight</th>
                  <th className="px-3 py-3">Silver rate/g</th>
                  <th className="px-3 py-3">Labour/g</th>
                  <th className="px-3 py-3">Actual cost</th>
                  <th className="px-3 py-3">Calculated cost</th>
                  <th className="px-3 py-3">Bill / Reference</th>
                </tr>
              </thead>

              <tbody>
                {entries.map((entry, index) => {
                  const missingCost =
                    ["stock_in", "opening_stock", "adjustment_in"].includes(
                      entry.movementType
                    ) &&
                    entry.actualAcquisitionCost == null &&
                    entry.calculatedSourceCost == null;

                  return (
                    <tr
                      key={entry._id || `${entry.pieceId}-${index}`}
                      className="border-b last:border-0 hover:bg-gray-50"
                    >
                      <td className="whitespace-nowrap px-3 py-4 text-gray-600">
                        {dateText(entry)}
                      </td>

                      <td className="px-3 py-4">
                        {movementLabels[entry.movementType] ||
                          entry.movementType ||
                          "—"}
                      </td>

                      <td className="px-3 py-4">
                        <span
                          className={
                            entry.direction === "in"
                              ? "rounded-full bg-green-50 px-2 py-1 text-xs font-medium text-green-700"
                              : "rounded-full bg-red-50 px-2 py-1 text-xs font-medium text-red-700"
                          }
                        >
                          {entry.direction === "in" ? "IN" : "OUT"}
                        </span>
                      </td>

                      <td className="px-3 py-4">
                        <div className="font-medium">
                          {entry.productName || "—"}
                        </div>
                        <div className="mt-1 text-xs text-gray-500">
                          {entry.sku || "—"}
                        </div>
                      </td>

                      <td className="px-3 py-4">{entry.batchId || "—"}</td>

                      <td className="whitespace-nowrap px-3 py-4">
                        {grams(entry.weight)}
                      </td>

                      <td className="px-3 py-4">
                        {money(entry.sourceSilverRate)}
                      </td>

                      <td className="px-3 py-4">
                        {money(entry.labourPerGram)}
                      </td>

                      <td className="px-3 py-4">
                        {missingCost ? (
                          <span className="font-medium text-amber-700">
                            Missing
                          </span>
                        ) : (
                          money(entry.actualAcquisitionCost)
                        )}
                      </td>

                      <td className="px-3 py-4">
                        {money(entry.calculatedSourceCost)}
                      </td>

                      <td className="px-3 py-4">
                        {entry.billNumber || entry.reference || "—"}
                      </td>
                    </tr>
                  );
                })}

                {!loading && entries.length === 0 && (
                  <tr>
                    <td
                      colSpan={11}
                      className="px-4 py-12 text-center text-gray-500"
                    >
                      No ledger entries found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <p className="text-xs leading-5 text-gray-500">
          Average silver rate is weight-weighted and uses only currently
          in-stock pieces with a recorded or decodable silver rate.
          Labour is calculated separately. Neither average includes
          jewellery making charges, packaging or other acquisition costs.
        </p>
      </div>
    </main>
  );
}