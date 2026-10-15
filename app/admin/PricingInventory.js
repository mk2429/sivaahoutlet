"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

function money(value) {
  if (value == null || !Number.isFinite(Number(value))) return "—";

  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  }).format(Number(value));
}

export default function PricingInventory() {
  const [inventory, setInventory] = useState([]);
  const [currentSilverRate, setCurrentSilverRate] = useState(0);
  const [totalPieces, setTotalPieces] = useState(0);
  const [readyPieces, setReadyPieces] = useState(0);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState(null);

  const loadInventory = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/admin/pricing-inventory", {
        cache: "no-store",
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Pricing inventory load nahi hui.");
      }

      setInventory(data.inventory || []);
      setCurrentSilverRate(Number(data.currentSilverRate || 0));
      setTotalPieces(Number(data.totalPieces || 0));
      setReadyPieces(Number(data.readyPieces || 0));
      setLastUpdated(new Date());
    } catch (err) {
      setError(err.message || "Pricing inventory load nahi hui.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadInventory();
  }, [loadInventory]);

  const filteredInventory = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) return inventory;

    return inventory.filter((item) =>
      [
        item.name,
        item.sku,
        item.category,
        item.batchId,
        item.batchDate,
        item.weight == null ? "" : String(item.weight),
      ].some((value) => String(value || "").toLowerCase().includes(query))
    );
  }, [inventory, search]);

  const totalCpToday = filteredInventory.reduce(
    (sum, item) => sum + (item.cpToday ?? 0),
    0
  );

  const totalCpSource = filteredInventory.reduce(
    (sum, item) => sum + (item.cpSource ?? 0),
    0
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-500">
            Inventory & Finance
          </p>
          <h2 className="mt-1 text-2xl font-bold">
            Pricing Inventory
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            Har available physical piece ki selling price aur dono cost
            valuations.
          </p>
        </div>

        <button
          type="button"
          onClick={loadInventory}
          disabled={loading}
          className="rounded-lg border px-4 py-2.5 text-sm font-medium disabled:opacity-50"
        >
          {loading ? "Refreshing..." : "Refresh Prices"}
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          label="Current Silver Rate"
          value={`${money(currentSilverRate)}/g`}
          note="From Silver Rate Settings"
        />

        <SummaryCard
          label="Available Pieces"
          value={totalPieces}
          note="Only in-stock pieces"
        />

        <SummaryCard
          label="Pricing Ready"
          value={`${readyPieces} / ${totalPieces}`}
          note="Valid weight and batch ID"
        />

        <SummaryCard
          label="Packaging Cost"
          value={money(50)}
          note="Hard-coded per piece"
        />
      </div>

      <div className="rounded-xl border bg-white p-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <label className="text-sm font-medium">
            Search inventory
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Product, SKU, batch ID or weight..."
              className="mt-1 w-full rounded-lg border px-3 py-3 font-normal"
            />
          </label>

          <div className="flex flex-col justify-end text-sm text-gray-500">
            <p>
              Matching pieces:{" "}
              <span className="font-semibold text-gray-900">
                {filteredInventory.length}
              </span>
            </p>
            <p>
              Total CP Today:{" "}
              <span className="font-semibold text-gray-900">
                {money(totalCpToday)}
              </span>
            </p>
            <p>
              Total CP Source:{" "}
              <span className="font-semibold text-gray-900">
                {money(totalCpSource)}
              </span>
            </p>
            {lastUpdated && (
              <p className="mt-1 text-xs">
                Updated at{" "}
                {lastUpdated.toLocaleTimeString("en-IN", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            )}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="rounded-xl border p-10 text-center text-gray-500">
          Loading outlet pricing...
        </div>
      ) : filteredInventory.length === 0 ? (
        <div className="rounded-xl border p-10 text-center text-gray-500">
          {inventory.length === 0
            ? "Outlet mein abhi koi available piece nahi hai."
            : "No matching pieces found."}
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden overflow-x-auto rounded-xl border bg-white xl:block">
            <table className="w-full min-w-[1250px] text-left text-sm">
              <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-4 py-3">Product / Piece</th>
                  <th className="px-4 py-3">Batch</th>
                  <th className="px-4 py-3 text-right">SP</th>
                  <th className="px-4 py-3 text-right">
                    SP After 15% Discount
                  </th>
                  <th className="px-4 py-3 text-right">CP Today</th>
                  <th className="px-4 py-3 text-right">CP Source</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>

              <tbody className="divide-y">
                {filteredInventory.map((item) => (
                  <tr key={item.pieceId} className="align-top">
                    <td className="px-4 py-4">
                      <div className="flex items-start gap-3">
                        {item.image ? (
                          <img
                            src={item.image}
                            alt={item.name}
                            className="h-12 w-12 rounded-lg border object-contain"
                          />
                        ) : (
                          <div className="h-12 w-12 rounded-lg bg-gray-100" />
                        )}

                        <div>
                          <p className="font-semibold text-gray-900">
                            {item.name}
                          </p>
                          <p className="mt-1 text-xs text-gray-500">
                            SKU: {item.sku}
                          </p>
                          <p className="mt-1 text-xs text-gray-500">
                            Weight: {item.weight ?? "—"} g
                          </p>
                          <p className="text-xs text-gray-500">
                            Piece ID: {item.pieceId.slice(-8)}
                          </p>
                        </div>
                      </div>
                    </td>

                    <td className="px-4 py-4">
                      <p className="font-medium">{item.batchId || "—"}</p>
                      <p className="mt-1 text-xs text-gray-500">
                        Date: {item.batchDate || "—"}
                      </p>
                      <p className="mt-1 text-xs text-gray-500">
                        Current rate: {money(item.currentSilverRate)}/g
                      </p>
                      <p className="text-xs text-gray-500">
                        Source rate:{" "}
                        {item.sourceSilverRate == null
                          ? "—"
                          : `${money(item.sourceSilverRate)}/g`}
                      </p>
                      <p className="text-xs text-gray-500">
                        Labour:{" "}
                        {item.labourPerGram == null
                          ? "—"
                          : `${money(item.labourPerGram)}/g`}
                      </p>
                    </td>

                    <PriceCell value={item.sp} />
                    <PriceCell value={item.spAfterDiscount} />
                    <PriceCell value={item.cpToday} />
                    <PriceCell value={item.cpSource} />

                    <td className="px-4 py-4">
                      {item.pricingStatus === "Ready" ? (
                        <span className="rounded-full bg-green-50 px-2.5 py-1 text-xs font-medium text-green-700">
                          Ready
                        </span>
                      ) : (
                        <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800">
                          {item.pricingStatus}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile and tablet cards */}
          <div className="grid grid-cols-1 gap-3 xl:hidden">
            {filteredInventory.map((item) => (
              <div
                key={item.pieceId}
                className="space-y-4 rounded-xl border bg-white p-4"
              >
                <div className="flex items-start gap-3">
                  {item.image ? (
                    <img
                      src={item.image}
                      alt={item.name}
                      className="h-16 w-16 rounded-lg border object-contain"
                    />
                  ) : (
                    <div className="h-16 w-16 rounded-lg bg-gray-100" />
                  )}

                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold">{item.name}</h3>
                    <p className="text-xs text-gray-500">
                      SKU: {item.sku}
                    </p>
                    <p className="mt-1 text-sm">
                      Weight: {item.weight ?? "—"} g
                    </p>
                    <p className="break-all text-xs text-gray-500">
                      Batch: {item.batchId || "Missing batch"}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <MobilePrice label="SP" value={item.sp} />
                  <MobilePrice
                    label="SP after 15% discount"
                    value={item.spAfterDiscount}
                  />
                  <MobilePrice label="CP Today" value={item.cpToday} />
                  <MobilePrice label="CP Source" value={item.cpSource} />
                </div>

                <div className="rounded-lg bg-gray-50 p-3 text-xs text-gray-600">
                  <p>Batch date: {item.batchDate || "—"}</p>
                  <p>
                    Current silver: {money(item.currentSilverRate)}/g
                  </p>
                  <p>
                    Source silver:{" "}
                    {item.sourceSilverRate == null
                      ? "—"
                      : `${money(item.sourceSilverRate)}/g`}
                  </p>
                  <p>
                    Batch labour:{" "}
                    {item.labourPerGram == null
                      ? "—"
                      : `${money(item.labourPerGram)}/g`}
                  </p>
                </div>

                {item.pricingStatus !== "Ready" && (
                  <p className="text-sm font-medium text-amber-700">
                    {item.pricingStatus}. Prices cannot be calculated safely.
                  </p>
                )}
              </div>
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
      <p className="mt-2 text-xl font-bold">{value}</p>
      <p className="mt-1 text-xs text-gray-500">{note}</p>
    </div>
  );
}

function PriceCell({ value }) {
  return (
    <td className="px-4 py-4 text-right font-semibold tabular-nums">
      {money(value)}
    </td>
  );
}

function MobilePrice({ label, value }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="mt-1 font-semibold tabular-nums">{money(value)}</p>
    </div>
  );
}