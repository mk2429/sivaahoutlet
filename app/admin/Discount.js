"use client";

import { useCallback, useEffect, useState } from "react";
import "./discounts.css";
const emptyForm = {
  name: "",
  type: "percentage",
  value: "10",
  applicability: "all",
  categoriesText: "",
  skusText: "",
  minBillAmount: "0",
  minWeightGrams: "0",
  startDate: "",
  endDate: "",
  active: true,
};

const money = (value) =>
  Number(value || 0).toLocaleString("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  });

function toDateInput(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const local = new Date(
    date.getTime() - date.getTimezoneOffset() * 60000
  );

  return local.toISOString().slice(0, 10);
}

function fromDiscount(discount) {
  return {
    ...emptyForm,
    name: discount.name || "",
    type: discount.type || "percentage",
    value: String(discount.value ?? ""),
    applicability: discount.applicability || "all",
    categoriesText: (discount.categories || []).join(", "),
    skusText: (discount.skus || []).join(", "),
    minBillAmount: String(discount.minBillAmount ?? 0),
    minWeightGrams: String(discount.minWeightGrams ?? 0),
    startDate: toDateInput(discount.startDate),
    endDate: toDateInput(discount.endDate),
    active: discount.active !== false,
  };
}

function toPayload(form, id) {
  return {
    ...(id ? { _id: id } : {}),
    name: form.name.trim(),
    type: form.type,
    value: Number(form.value),
    applicability: form.applicability,
    categories: form.categoriesText
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
    skus: form.skusText
      .split(",")
      .map((item) => item.trim().toUpperCase())
      .filter(Boolean),
    minBillAmount: Number(form.minBillAmount || 0),
    minWeightGrams: Number(form.minWeightGrams || 0),
    startDate: form.startDate || null,
    endDate: form.endDate || null,
    active: form.active,
  };
}

export default function Discounts() {
  const [discounts, setDiscounts] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const loadDiscounts = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/admin/discounts", {
        cache: "no-store",
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Could not load discounts.");
      }

      setDiscounts(data.discounts || []);
    } catch (err) {
      setError(err.message || "Could not load discounts.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDiscounts();
  }, [loadDiscounts]);

  function updateField(event) {
    const { name, value, type, checked } = event.target;

    setForm((previous) => ({
      ...previous,
      [name]: type === "checkbox" ? checked : value,
    }));
  }

  function startCreate() {
    setEditingId(null);
    setForm({ ...emptyForm });
    setError("");
    setMessage("");
    setShowForm(true);
  }

  function startEdit(discount) {
    setEditingId(discount._id);
    setForm(fromDiscount(discount));
    setError("");
    setMessage("");
    setShowForm(true);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch("/api/admin/discounts", {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(toPayload(form, editingId)),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Could not save discount.");
      }

      setMessage(data.message || "Discount saved.");
      setShowForm(false);
      setEditingId(null);
      setForm({ ...emptyForm });

      await loadDiscounts();
    } catch (err) {
      setError(err.message || "Could not save discount.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleStatus(discount) {
    setError("");
    setMessage("");

    try {
      const payload = toPayload(fromDiscount(discount), discount._id);
      payload.active = !discount.active;

      const response = await fetch("/api/admin/discounts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Could not update status.");
      }

      setMessage(
        `Discount ${payload.active ? "activated" : "deactivated"}.`
      );

      await loadDiscounts();
    } catch (err) {
      setError(err.message || "Could not update status.");
    }
  }

  const filteredDiscounts = discounts.filter((discount) => {
    const text = [
      discount.name,
      discount.type,
      discount.applicability,
      ...(discount.categories || []),
      ...(discount.skus || []),
    ]
      .join(" ")
      .toLowerCase();

    return text.includes(search.trim().toLowerCase());
  });

  return (
    <section className="module-page">
      <div className="eyebrow">ADMINISTRATION</div>
      <h2>Discounts</h2>
      <p className="page-description">
        Create and manage the offers available at your outlet.
      </p>

      <div className="module-card" style={{ marginBottom: 20 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div>
            <h3 style={{ marginTop: 0 }}>Discount Rules</h3>
            <p>
              {discounts.length} saved discount
              {discounts.length === 1 ? "" : "s"}
            </p>
          </div>

          <button className="primary-button" onClick={startCreate}>
            + Create Discount
          </button>
        </div>
      </div>

      {error && (
        <div role="alert" className="module-card" style={{ color: "#b42318" }}>
          {error}
        </div>
      )}

      {message && (
        <div role="status" className="module-card" style={{ color: "#067647" }}>
          {message}
        </div>
      )}

      {showForm && (
        <form
          className="module-card"
          onSubmit={handleSubmit}
          style={{ marginBottom: 20 }}
        >
          <h3>{editingId ? "Edit Discount" : "Create Discount"}</h3>

          <div className="discount-form-grid">
            <label className="discount-field">
              Discount Name *
              <input
                name="name"
                value={form.name}
                onChange={updateField}
                placeholder="e.g. Festive Offer"
                required
                maxLength={100}
              />
            </label>

            <label className="discount-field">
              Discount Type *
              <select
                name="type"
                value={form.type}
                onChange={updateField}
                required
              >
                <option value="percentage">Percentage (%)</option>
                <option value="flat">Flat Amount (₹)</option>
              </select>
            </label>

            <label className="discount-field">
              Discount Value *
              <input
                name="value"
                type="number"
                min="0.01"
                max={form.type === "percentage" ? "100" : undefined}
                step="0.01"
                value={form.value}
                onChange={updateField}
                required
              />
            </label>

            <label className="discount-field">
              Applicable To *
              <select
                name="applicability"
                value={form.applicability}
                onChange={updateField}
              >
                <option value="all">All Products</option>
                <option value="category">Selected Categories</option>
                <option value="sku">Specific SKUs</option>
              </select>
            </label>

            {form.applicability === "category" && (
              <label className="discount-field discount-wide">
                Categories * (comma-separated)
                <input
                  name="categoriesText"
                  value={form.categoriesText}
                  onChange={updateField}
                  placeholder="Rings, Earrings, Pendants"
                  required
                />
              </label>
            )}

            {form.applicability === "sku" && (
              <label className="discount-field discount-wide">
                SKUs * (comma-separated)
                <input
                  name="skusText"
                  value={form.skusText}
                  onChange={updateField}
                  placeholder="SIV-RING-001, SIV-STUD-001"
                  required
                />
              </label>
            )}

            <label className="discount-field">
              Minimum Bill Amount (₹)
              <input
                name="minBillAmount"
                type="number"
                min="0"
                step="0.01"
                value={form.minBillAmount}
                onChange={updateField}
              />
            </label>

            <label className="discount-field">
              Minimum Weight (g)
              <input
                name="minWeightGrams"
                type="number"
                min="0"
                step="0.001"
                value={form.minWeightGrams}
                onChange={updateField}
              />
            </label>

            <label className="discount-field">
              Start Date (optional)
              <input
                name="startDate"
                type="date"
                value={form.startDate}
                onChange={updateField}
              />
            </label>

            <label className="discount-field">
              End Date (optional)
              <input
                name="endDate"
                type="date"
                value={form.endDate}
                onChange={updateField}
              />
            </label>
          </div>

          <label
            style={{
              display: "flex",
              gap: 10,
              alignItems: "center",
              marginTop: 18,
            }}
          >
            <input
              name="active"
              type="checkbox"
              checked={form.active}
              onChange={updateField}
            />
            Discount is active
          </label>

          <div
            style={{
              display: "flex",
              gap: 10,
              marginTop: 22,
              flexWrap: "wrap",
            }}
          >
            <button
              className="primary-button"
              type="submit"
              disabled={saving}
            >
              {saving
                ? "Saving..."
                : editingId
                  ? "Save Changes"
                  : "Create Discount"}
            </button>

            <button
              className="secondary-button"
              type="button"
              disabled={saving}
              onClick={() => {
                setShowForm(false);
                setEditingId(null);
                setError("");
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="module-card">
        <label className="discount-field" style={{ marginBottom: 18 }}>
          Search Discounts
          <input
            type="search"
            placeholder="Search by name, category or SKU..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>

        {loading ? (
          <p>Loading discounts...</p>
        ) : filteredDiscounts.length === 0 ? (
          <p>No discounts found. Create your first discount above.</p>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {filteredDiscounts.map((discount) => (
              <article
                key={discount._id}
                style={{
                  border: "1px solid #e7e2d9",
                  borderRadius: 12,
                  padding: 16,
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 16,
                  alignItems: "flex-start",
                  flexWrap: "wrap",
                }}
              >
                <div style={{ flex: "1 1 240px" }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      flexWrap: "wrap",
                    }}
                  >
                    <strong>{discount.name}</strong>
                    <span
                      style={{
                        fontSize: 12,
                        padding: "4px 8px",
                        borderRadius: 20,
                        background: discount.active ? "#e7f6ec" : "#f1f1f1",
                        color: discount.active ? "#17663a" : "#555",
                      }}
                    >
                      {discount.active ? "Active" : "Inactive"}
                    </span>
                  </div>

                  <p style={{ margin: "8px 0" }}>
                    {discount.type === "percentage"
                      ? `${discount.value}% off`
                      : `${money(discount.value)} off`}
                    {" · "}
                    {discount.applicability === "all"
                      ? "All Products"
                      : discount.applicability === "category"
                        ? `Categories: ${(discount.categories || []).join(", ")}`
                        : `SKUs: ${(discount.skus || []).join(", ")}`}
                  </p>

                  <p style={{ fontSize: 13, color: "#666", margin: 0 }}>
                    Min. bill: {money(discount.minBillAmount)}
                    {" · "}
                    Min. weight: {discount.minWeightGrams || 0} g
                  </p>

                  {(discount.startDate || discount.endDate) && (
                    <p style={{ fontSize: 13, color: "#666", marginBottom: 0 }}>
                      Valid: {discount.startDate
                        ? new Date(discount.startDate).toLocaleDateString("en-IN")
                        : "No start date"}
                      {" – "}
                      {discount.endDate
                        ? new Date(discount.endDate).toLocaleDateString("en-IN")
                        : "No end date"}
                    </p>
                  )}
                </div>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button
                    className="secondary-button"
                    onClick={() => startEdit(discount)}
                  >
                    Edit
                  </button>

                  <button
                    className="secondary-button"
                    onClick={() => toggleStatus(discount)}
                  >
                    {discount.active ? "Deactivate" : "Activate"}
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}