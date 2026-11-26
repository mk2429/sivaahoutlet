"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

const money = (v) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(Number(v) || 0);

async function safeFetchJson(url, options) {
  const res = await fetch(url, options);
  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    const text = await res.text();
    throw new Error(
      `API ${url} returned HTTP ${res.status} (not JSON). Check that the route file exists.`
    );
  }
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data;
}

export default function WholesaleSalePage() {
  const router = useRouter();

  const [inStockPieces, setInStockPieces] = useState([]);
  const [loadingPieces, setLoadingPieces] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [search, setSearch] = useState("");

  const [silverRate, setSilverRate] = useState("");
  const [cart, setCart] = useState([]);
  const [paymentMethod, setPaymentMethod] = useState("Cash");
  const [amountPaid, setAmountPaid] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Load products and flatten all pieces where status === "inStock"
 useEffect(() => {
    async function loadInventory() {
      setLoadingPieces(true);
      setLoadError("");
      try {
        const data = await safeFetchJson("/api/admin/wholesale-sales");
        setInStockPieces(data.pieces || []);
      } catch (err) {
        setLoadError(err.message);
      } finally {
        setLoadingPieces(false);
      }
    }
    loadInventory();
  }, []);

  const filteredPieces = inStockPieces.filter((p) => {
    if (cart.some((c) => String(c.pieceId) === String(p.pieceId))) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      p.name.toLowerCase().includes(q) ||
      p.sku.toLowerCase().includes(q) ||
      p.batchId.toLowerCase().includes(q)
    );
  });

  function addPiece(piece) {
    setCart((prev) => [
      ...prev,
      {
        ...piece,
        makingPerGm: "",
      },
    ]);
  }

  function updateMaking(pieceId, val) {
    setCart((prev) =>
      prev.map((item) =>
        String(item.pieceId) === String(pieceId)
          ? { ...item, makingPerGm: val }
          : item
      )
    );
  }

  function removeItem(pieceId) {
    setCart((prev) =>
      prev.filter((item) => String(item.pieceId) !== String(pieceId))
    );
  }

  // Bill Calculation: (Weight * Silver Rate) + (Weight * Making/gm)
  const rate = Number(silverRate) || 0;
  const billItems = cart.map((item) => {
    const making = Number(item.makingPerGm) || 0;
    const finalPrice = Math.round((item.weight * rate + item.weight * making) * 100) / 100;
    return { ...item, making, finalPrice };
  });

  const totalWeight = billItems.reduce((sum, i) => sum + i.weight, 0);
  const grossAmount = billItems.reduce((sum, i) => sum + i.finalPrice, 0);
  const netAmount = Math.round(grossAmount);

  async function handleSubmit(e) {
    e.preventDefault();
    if (cart.length === 0) return alert("Select at least one piece.");
    if (!rate || rate <= 0) return alert("Enter the silver rate for this bill.");

    try {
      setSubmitting(true);
      const paid =
        amountPaid === "" ? netAmount : Math.round(Number(amountPaid) || 0);

      const data = await safeFetchJson("/api/admin/wholesale-sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wholesaleSilverRate: rate,
          items: billItems.map((i) => ({
            productId: i.productId,
            pieceId: i.pieceId,
            makingPerGm: i.making,
          })),
          paymentMethod,
          amountPaid: paid,
          salespersonName: "Wholesale",
        }),
      });

      const saleId = data?.sale?._id || data?.saleId;
      if (!saleId) throw new Error("Sale saved, but sale ID was missing in response.");

      router.push(`/sale/invoice/${saleId}`);
    } catch (err) {
      alert(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ maxWidth: 960, margin: "0 auto", padding: 20, fontFamily: "sans-serif" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>Wholesale Sale (Customer: Wholesale)</h2>
        <button
          type="button"
          onClick={() => router.push("/admin")}
          style={{ padding: "6px 12px", cursor: "pointer" }}
        >
          ← Admin
        </button>
      </div>

      {loadError && (
        <div style={{ padding: 12, marginBottom: 16, background: "#fee2e2", color: "#991b1b", borderRadius: 6 }}>
          {loadError}
        </div>
      )}

      {/* 1. Silver Rate Input + Piece Search */}
      <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: 12, marginBottom: 12 }}>
        <div>
          <label style={{ fontSize: 12, fontWeight: 600 }}>Bill Silver Rate (₹/gm) *</label>
          <input
            type="number"
            step="0.01"
            placeholder="e.g. 150"
            value={silverRate}
            onChange={(e) => setSilverRate(e.target.value)}
            style={{ width: "100%", padding: 8, marginTop: 4, border: "1px solid #ccc", borderRadius: 6 }}
          />
        </div>
        <div>
          <label style={{ fontSize: 12, fontWeight: 600 }}>
            Search &amp; Pick In-Stock Piece ({inStockPieces.length} available)
          </label>
          <input
            type="text"
            placeholder={loadingPieces ? "Loading pieces..." : "Search by name, SKU, or Batch ID..."}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: "100%", padding: 8, marginTop: 4, border: "1px solid #ccc", borderRadius: 6 }}
          />
        </div>
      </div>

      {/* Piece Picker Dropdown */}
      {search.trim() !== "" && (
        <div style={{ border: "1px solid #ddd", borderRadius: 6, maxHeight: 200, overflowY: "auto", marginBottom: 16 }}>
          {filteredPieces.length === 0 ? (
            <div style={{ padding: 10, color: "#666", fontSize: 13 }}>No matching in-stock pieces.</div>
          ) : (
            filteredPieces.slice(0, 25).map((p) => (
              <div
                key={p.pieceId}
                onClick={() => {
                  addPiece(p);
                  setSearch("");
                }}
                style={{
                  padding: "8px 12px",
                  borderBottom: "1px solid #eee",
                  display: "flex",
                  justifyContent: "space-between",
                  cursor: "pointer",
                  background: "#fafafa",
                }}
              >
                <span>
                  <b>{p.name}</b> ({p.sku}) • Batch: {p.batchId} — <b>{p.weight.toFixed(3)} g</b>
                </span>
                <span style={{ color: "#2563eb", fontWeight: 600 }}>+ Add</span>
              </div>
            ))
          )}
        </div>
      )}

      {/* 2. Selected Pieces Table */}
      <form onSubmit={handleSubmit}>
        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 16, fontSize: 14 }}>
          <thead>
            <tr style={{ background: "#f3f4f6", textAlign: "left" }}>
              <th style={{ padding: 8, border: "1px solid #ddd" }}>Piece</th>
              <th style={{ padding: 8, border: "1px solid #ddd" }}>Weight (g)</th>
              <th style={{ padding: 8, border: "1px solid #ddd" }}>Making / gm (₹)</th>
              <th style={{ padding: 8, border: "1px solid #ddd" }}>Amount</th>
              <th style={{ padding: 8, border: "1px solid #ddd" }}></th>
            </tr>
          </thead>
          <tbody>
            {billItems.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ padding: 16, textAlign: "center", color: "#777", border: "1px solid #ddd" }}>
                  Search and select pieces above to build the wholesale bill.
                </td>
              </tr>
            ) : (
              billItems.map((item) => (
                <tr key={item.pieceId}>
                  <td style={{ padding: 8, border: "1px solid #ddd" }}>
                    <b>{item.name}</b> <small>({item.sku})</small>
                    <div style={{ fontSize: 11, color: "#666" }}>Batch: {item.batchId}</div>
                  </td>
                  <td style={{ padding: 8, border: "1px solid #ddd" }}>{item.weight.toFixed(3)} g</td>
                  <td style={{ padding: 8, border: "1px solid #ddd" }}>
                    <input
                      type="number"
                      step="0.01"
                      required
                      placeholder="Making/gm"
                      value={item.makingPerGm}
                      onChange={(e) => updateMaking(item.pieceId, e.target.value)}
                      style={{ width: 110, padding: 6, border: "1px solid #ccc", borderRadius: 4 }}
                    />
                  </td>
                  <td style={{ padding: 8, border: "1px solid #ddd", fontWeight: 600 }}>
                    {money(item.finalPrice)}
                  </td>
                  <td style={{ padding: 8, border: "1px solid #ddd", textAlign: "center" }}>
                    <button
                      type="button"
                      onClick={() => removeItem(item.pieceId)}
                      style={{ color: "red", border: "none", background: "none", cursor: "pointer" }}
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {/* 3. Bill Summary & Submit */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            background: "#f9fafb",
            padding: 14,
            borderRadius: 8,
            border: "1px solid #ddd",
          }}
        >
          <div>
            <div>
              Total Weight: <b>{totalWeight.toFixed(3)} g</b>
            </div>
            <div style={{ fontSize: 18, marginTop: 4 }}>
              Net Bill Amount: <b>{money(netAmount)}</b>
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
              style={{ padding: 8, borderRadius: 6, border: "1px solid #ccc" }}
            >
              <option value="Cash">Cash</option>
              <option value="UPI">UPI</option>
              <option value="Bank Transfer">Bank Transfer</option>
            </select>

            <input
              type="number"
              placeholder={`Paid (₹${netAmount})`}
              value={amountPaid}
              onChange={(e) => setAmountPaid(e.target.value)}
              style={{ width: 130, padding: 8, borderRadius: 6, border: "1px solid #ccc" }}
            />

            <button
              type="submit"
              disabled={submitting || cart.length === 0}
              style={{
                padding: "10px 18px",
                background: "#16a34a",
                color: "#fff",
                border: "none",
                borderRadius: 6,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              {submitting ? "Saving..." : "Submit Wholesale Bill"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}