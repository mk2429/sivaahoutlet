"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import "./sale.css";

const money = (value) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(Number(value || 0));

export default function SaleDashboard() {
  const [data, setData] = useState({
    customers: [],
    pieces: [],
    discounts: [],
    silverRate: 0,
  });

  const [customerId, setCustomerId] = useState("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState([]);
  const [discountId, setDiscountId] = useState("");
  const [salespersonName, setSalespersonName] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("Cash");
  const [amountPaid, setAmountPaid] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const loadOptions = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/outlet/sale-options", {
        cache: "no-store",
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Could not load sale options.");
      }

      setData(result);
    } catch (err) {
      setError(err.message || "Could not load sale options.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOptions();
  }, [loadOptions]);

  const filteredPieces = useMemo(() => {
    const q = search.trim().toLowerCase();

    if (!q) return data.pieces.slice(0, 100);

    return data.pieces
      .filter((piece) =>
        [
          piece.name,
          piece.sku,
          piece.category,
          piece.batchId,
        ].some((value) =>
          String(value || "").toLowerCase().includes(q)
        )
      )
      .slice(0, 150);
  }, [data.pieces, search]);

  const selectedPieces = useMemo(
    () =>
      selected
        .map((id) =>
          data.pieces.find(
            (piece) => `${piece.productId}:${piece.pieceId}` === id
          )
        )
        .filter(Boolean),
    [selected, data.pieces]
  );

  const gross = selectedPieces.reduce(
    (sum, piece) => sum + piece.listPrice,
    0
  );

  const totalWeight = selectedPieces.reduce(
    (sum, piece) => sum + piece.weight,
    0
  );

const [currentTime, setCurrentTime] = useState(0);

useEffect(() => {
  setCurrentTime(new Date().getTime());
}, []);

const eligibleDiscounts = useMemo(() => {
  if (!currentTime) return [];

  return data.discounts.filter((discount) => {
    if (
      discount.startDate &&
      new Date(discount.startDate).getTime() > currentTime
    ) {
      return false;
    }

    if (
      discount.endDate &&
      new Date(discount.endDate).getTime() < currentTime
    ) {
      return false;
    }

    if (gross < discount.minBillAmount) return false;
    if (totalWeight < discount.minWeightGrams) return false;

    return selectedPieces.some((piece) => {
      if (discount.applicability === "category") {
        return (discount.categories || []).includes(piece.category);
      }

      if (discount.applicability === "sku") {
        return (discount.skus || []).includes(piece.sku);
      }

      return true;
    });
  });
}, [
  currentTime,
  data.discounts,
  gross,
  totalWeight,
  selectedPieces,
]);

  // Clear a discount if it becomes ineligible after the cart changes.
  useEffect(() => {
    if (
      discountId &&
      !eligibleDiscounts.some((discount) => discount._id === discountId)
    ) {
      setDiscountId("");
    }
  }, [discountId, eligibleDiscounts]);

  const selectedDiscount = eligibleDiscounts.find(
    (discount) => discount._id === discountId
  );

  const discountTotal = selectedDiscount
    ? selectedPieces.reduce((sum, piece) => {
        let eligible = true;

        if (selectedDiscount.applicability === "category") {
          eligible = (selectedDiscount.categories || []).includes(
            piece.category
          );
        } else if (selectedDiscount.applicability === "sku") {
          eligible = (selectedDiscount.skus || []).includes(piece.sku);
        }

        if (!eligible) return sum;

        const raw =
          selectedDiscount.type === "percentage"
            ? (piece.listPrice * selectedDiscount.value) / 100
            : selectedDiscount.value;

        return sum + Math.min(raw, piece.listPrice * 0.15);
      }, 0)
    : 0;

  const net = Math.max(
    0,
    Math.round((gross - discountTotal) * 100) / 100
  );

  function togglePiece(piece) {
    const id = `${piece.productId}:${piece.pieceId}`;

    setSelected((previous) =>
      previous.includes(id)
        ? previous.filter((value) => value !== id)
        : [...previous, id]
    );
  }

  async function completeSale(event) {
    event.preventDefault();
    setError("");

    if (selectedPieces.length === 0) {
      setError("Select at least one jewellery piece.");
      return;
    }

    const paid = amountPaid === "" ? net : Number(amountPaid);

    if (!Number.isFinite(paid) || paid < 0 || paid > net) {
      setError("Amount received must be between ₹0 and the bill total.");
      return;
    }

    setSaving(true);

    try {
      const response = await fetch("/api/outlet/sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId: customerId || null,
          items: selectedPieces.map((piece) => ({
            productId: piece.productId,
            pieceId: piece.pieceId,
          })),
          discountId: discountId || null,
          paymentMethod,
          amountPaid: paid,
          paymentSummary: paid > 0
            ? [{ method: paymentMethod, amount: paid }]
            : [],
          salespersonName,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Could not save the sale.");
      }

      if (!result.sale?._id) {
        throw new Error("Sale saved, but the invoice ID was not returned.");
      }

      window.location.href =
        `/sale/invoice/${encodeURIComponent(result.sale._id)}`;
    } catch (err) {
      setError(err.message || "Could not save the sale.");
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <main className="sale-shell">
        <p>Loading Sale Dashboard…</p>
      </main>
    );
  }

  return (
    <main className="sale-shell">
      <header className="sale-topbar">
        <div>
          <div className="sale-eyebrow">SIVAAH OUTLET</div>
          <h1>New Sale</h1>
          <p>Select the customer, exact jewellery pieces and payment.</p>
        </div>

        <div className="sale-rate">
          <span>Current silver rate</span>
          <strong>{money(data.silverRate)} / g</strong>
        </div>
      </header>

      {error && <div className="sale-alert">{error}</div>}

      <form className="sale-layout" onSubmit={completeSale}>
        <section className="sale-panel">
          <div className="sale-section-heading">
            <span>01</span>
            <h2>Customer</h2>
          </div>

          <label className="sale-label" htmlFor="customer">
            Select customer
          </label>

          <select
            id="customer"
            value={customerId}
            onChange={(event) => setCustomerId(event.target.value)}
          >
            <option value="">Walk-in Customer</option>

            {data.customers.map((customer) => (
              <option key={customer._id} value={customer._id}>
                {customer.name}
                {customer.whatsappNumber
                  ? ` — ${customer.whatsappNumber}`
                  : ""}
              </option>
            ))}
          </select>

          <div className="sale-section-heading sale-inventory-heading">
            <span>02</span>
            <h2>Available Jewellery</h2>
            <small>{data.pieces.length} pieces</small>
          </div>

          <input
            className="sale-search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search product, SKU, category or batch…"
          />

          <div className="sale-piece-list">
            {filteredPieces.map((piece) => {
              const id = `${piece.productId}:${piece.pieceId}`;
              const isSelected = selected.includes(id);

              return (
                <button
                  type="button"
                  key={id}
                  className={`sale-piece ${isSelected ? "is-selected" : ""}`}
                  onClick={() => togglePiece(piece)}
                >
                  <span className="sale-piece-check">
                    {isSelected ? "✓" : "+"}
                  </span>

                  <span className="sale-piece-details">
                    <strong>{piece.name}</strong>
                    <small>
                      {piece.sku || "No SKU"} · {piece.weight.toFixed(3)} g
                    </small>
                    <small>Batch: {piece.batchId}</small>
                  </span>

                  <strong>{money(piece.listPrice)}</strong>
                </button>
              );
            })}

            {filteredPieces.length === 0 && (
              <p className="sale-empty">
                No available pieces found.
              </p>
            )}
          </div>
        </section>

        <aside className="sale-panel">
          <div className="sale-section-heading">
            <span>03</span>
            <h2>Bill Summary</h2>
          </div>

          <div className="sale-selected-list">
            {selectedPieces.length === 0 ? (
              <p className="sale-empty">No items selected yet.</p>
            ) : (
              selectedPieces.map((piece) => (
                <div
                  className="sale-selected-item"
                  key={`${piece.productId}:${piece.pieceId}`}
                >
                  <div>
                    <strong>{piece.name}</strong>
                    <small>{piece.weight.toFixed(3)} g</small>
                  </div>

                  <div className="sale-selected-price">
                    <strong>{money(piece.listPrice)}</strong>
                    <button
                      type="button"
                      onClick={() => togglePiece(piece)}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          <label className="sale-label" htmlFor="discount">
            Eligible discount
          </label>

          <select
            id="discount"
            value={discountId}
            onChange={(event) => setDiscountId(event.target.value)}
          >
            <option value="">No discount</option>

            {eligibleDiscounts.map((discount) => (
              <option key={discount._id} value={discount._id}>
                {discount.name} (
                {discount.type === "percentage"
                  ? `${discount.value}%`
                  : money(discount.value)}
                )
              </option>
            ))}
          </select>

          <p className="sale-help">
            The server checks discount eligibility again before recording
            the sale. The current implementation caps the discount at
            15% per eligible item.
          </p>

          <div className="sale-totals">
            <div>
              <span>Pieces</span>
              <strong>{selectedPieces.length}</strong>
            </div>
            <div>
              <span>Total weight</span>
              <strong>{totalWeight.toFixed(3)} g</strong>
            </div>
            <div>
              <span>Subtotal</span>
              <strong>{money(gross)}</strong>
            </div>
            <div>
              <span>Discount</span>
              <strong>− {money(discountTotal)}</strong>
            </div>
            <div className="sale-grand-total">
              <span>Payable</span>
              <strong>{money(net)}</strong>
            </div>
          </div>

          <div className="sale-section-heading sale-payment-heading">
            <span>04</span>
            <h2>Payment</h2>
          </div>

          <label className="sale-label" htmlFor="salesperson">
            Salesperson
          </label>
          <input
            id="salesperson"
            value={salespersonName}
            onChange={(event) => setSalespersonName(event.target.value)}
            placeholder="Enter salesperson name"
          />

          <label className="sale-label" htmlFor="paymentMethod">
            Payment method
          </label>
          <select
            id="paymentMethod"
            value={paymentMethod}
            onChange={(event) => setPaymentMethod(event.target.value)}
          >
            {["Cash", "UPI", "Card", "Bank Transfer", "Other"].map(
              (method) => (
                <option key={method} value={method}>
                  {method}
                </option>
              )
            )}
          </select>

          <label className="sale-label" htmlFor="amountPaid">
            Amount received (₹)
          </label>
          <input
            id="amountPaid"
            type="number"
            min="0"
            max={net}
            step="0.01"
            value={amountPaid}
            onChange={(event) => setAmountPaid(event.target.value)}
            placeholder={net.toFixed(2)}
          />

          <button
            className="sale-submit"
            type="submit"
            disabled={saving || selectedPieces.length === 0}
          >
            {saving ? "Recording Sale…" : "Complete Sale & Open Invoice"}
          </button>

          <p className="sale-help">
            Once saved, the invoice will open automatically.
          </p>
        </aside>
      </form>
    </main>
  );
}