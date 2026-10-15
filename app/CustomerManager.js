
"use client";

import { useCallback, useEffect, useState } from "react";
import "./customer-manager.css";

const blankForm = {
  name: "",
  whatsappNumber: "",
  gender: "",
  address: "",
  dateOfBirth: "",
  anniversaryDate: "",
};

async function api(url, options = {}) {
  const response = await fetch(url, {
    cache: "no-store",
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.message || "Something went wrong.");
  }

  return data;
}

function formatDate(value) {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "—";

  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default function CustomerManager() {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState("directory");
  const [customers, setCustomers] = useState([]);
  const [query, setQuery] = useState("");
  const [profile, setProfile] = useState(null);
  const [form, setForm] = useState(blankForm);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadCustomers = useCallback(async (search = "") => {
    setLoading(true);
    setError("");

    try {
      const data = await api(
        `/api/outlet/customers?q=${encodeURIComponent(search)}`
      );

      setCustomers(data.customers || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open || view !== "directory") return;

    const timer = setTimeout(() => loadCustomers(query), 250);

    return () => clearTimeout(timer);
  }, [open, view, query, loadCustomers]);

  useEffect(() => {
    if (!open) return;

    function handleKeyDown(event) {
      if (event.key === "Escape") closeManager();
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  function closeManager() {
    setOpen(false);
    setView("directory");
    setProfile(null);
    setError("");
    setNotice("");
  }

  function newCustomer() {
    setProfile(null);
    setForm(blankForm);
    setEditing(false);
    setError("");
    setNotice("");
    setView("form");
  }

  async function openProfile(id) {
    setLoading(true);
    setError("");
    setNotice("");

    try {
      const data = await api(`/api/outlet/customers/${id}`);
      setProfile(data.customer);
      setView("profile");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function editCustomer() {
    if (!profile) return;

    const toInputDate = (value) => {
      if (!value) return "";
      const date = new Date(value);
      return Number.isNaN(date.getTime())
        ? ""
        : date.toISOString().slice(0, 10);
    };

    setForm({
      name: profile.name || "",
      whatsappNumber: profile.whatsappNumber || "",
      gender: profile.gender || "",
      address: profile.address || "",
      dateOfBirth: toInputDate(profile.dateOfBirth),
      anniversaryDate: toInputDate(profile.anniversaryDate),
    });

    setEditing(true);
    setError("");
    setNotice("");
    setView("form");
  }

  async function saveCustomer(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");

    const payload = {
      ...form,
      whatsappNumber: form.whatsappNumber.replace(/\D/g, ""),
    };

    try {
      let data;

      if (editing && profile?._id) {
        data = await api(`/api/outlet/customers/${profile._id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });

        setNotice("Customer details updated successfully.");
      } else {
        data = await api("/api/outlet/customers", {
          method: "POST",
          body: JSON.stringify(payload),
        });

        setNotice("Customer registered successfully.");
      }

      setProfile(data.customer);
      setView("profile");
      await loadCustomers(query);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className="header-customer"
        onClick={() => {
          setOpen(true);
          setView("directory");
          setProfile(null);
          setError("");
          setNotice("");
        }}
      >
        <span>＋</span> Add Customer
      </button>

      {open && (
        <div
          className="customer-overlay"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeManager();
          }}
        >
          <section
            className="customer-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="customer-title"
          >
            <header className="customer-header">
              <div>
                <p className="customer-eyebrow">SIVAAH CUSTOMER BOOK</p>

                <h2 id="customer-title">
                  {view === "form"
                    ? editing
                      ? "Edit Customer"
                      : "New Customer"
                    : view === "profile"
                      ? "Customer Profile"
                      : "Customers"}
                </h2>

                <p>Customer details, all in one place.</p>
              </div>

              <button
                className="customer-close"
                type="button"
                onClick={closeManager}
                aria-label="Close"
              >
                ×
              </button>
            </header>

            {error && (
              <div className="customer-alert customer-error" role="alert">
                {error}
              </div>
            )}

            {notice && (
              <div className="customer-alert customer-success">
                {notice}
              </div>
            )}

            {view === "directory" && (
              <div className="customer-content">
                <div className="customer-toolbar">
                  <span className="customer-count">
                    {customers.length} customers shown
                  </span>

                  <button
                    className="customer-primary"
                    type="button"
                    onClick={newCustomer}
                  >
                    ＋ New Customer
                  </button>
                </div>

                <input
                  className="customer-search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search by name or WhatsApp number..."
                />

                {loading ? (
                  <div className="customer-empty">Loading customers...</div>
                ) : customers.length === 0 ? (
                  <div className="customer-empty">
                    <strong>No customers found</strong>
                    <p>Add a customer or try another search.</p>
                  </div>
                ) : (
                  <div className="customer-list">
                    {customers.map((customer) => (
                      <button
                        type="button"
                        className="customer-row"
                        key={customer._id}
                        onClick={() => openProfile(customer._id)}
                      >
                        <span className="customer-avatar">
                          {(customer.name || "C").charAt(0).toUpperCase()}
                        </span>

                        <span className="customer-row-main">
                          <strong>{customer.name}</strong>
                          <small>{customer.whatsappNumber}</small>
                        </span>

                        <span className="customer-row-date">
                          {formatDate(customer.createdAt)}
                        </span>

                        <span className="customer-chevron">›</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {view === "form" && (
              <form className="customer-content" onSubmit={saveCustomer}>
                <div className="customer-form-grid">
                  <label className="customer-field full">
                    Customer Name *
                    <input
                      required
                      maxLength={100}
                      autoFocus
                      value={form.name}
                      onChange={(e) =>
                        setForm({ ...form, name: e.target.value })
                      }
                      placeholder="Enter full name"
                    />
                  </label>

                  <label className="customer-field full">
                    WhatsApp Number *
                    <input
                      required
                      inputMode="tel"
                      value={form.whatsappNumber}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          whatsappNumber: e.target.value,
                        })
                      }
                      placeholder="Enter mobile number"
                    />
                  </label>

                  <label className="customer-field">
                    Gender *
                    <select
                      required
                      value={form.gender}
                      onChange={(e) =>
                        setForm({ ...form, gender: e.target.value })
                      }
                    >
                      <option value="">Select gender</option>
                      <option value="Female">Female</option>
                      <option value="Male">Male</option>
                      <option value="Other">Other</option>
                      <option value="Prefer not to say">
                        Prefer not to say
                      </option>
                    </select>
                  </label>

                  <label className="customer-field">
                    Date of Birth
                    <input
                      type="date"
                      value={form.dateOfBirth}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          dateOfBirth: e.target.value,
                        })
                      }
                    />
                  </label>

                  <label className="customer-field full">
                    Address
                    <textarea
                      rows={2}
                      maxLength={500}
                      value={form.address}
                      onChange={(e) =>
                        setForm({ ...form, address: e.target.value })
                      }
                      placeholder="House, street, town, PIN code..."
                    />
                  </label>

                  <label className="customer-field full">
                    Anniversary Date
                    <input
                      type="date"
                      value={form.anniversaryDate}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          anniversaryDate: e.target.value,
                        })
                      }
                    />
                  </label>
                </div>

                <p className="customer-form-note">
                  Purchase history will be connected when we build the Sale
                  Dashboard.
                </p>

                <div className="customer-actions">
                  <button
                    type="button"
                    className="customer-secondary"
                    onClick={() => {
                      setError("");
                      setView(editing ? "profile" : "directory");
                    }}
                  >
                    Cancel
                  </button>

                  <button
                    type="submit"
                    className="customer-primary"
                    disabled={saving}
                  >
                    {saving
                      ? "Saving..."
                      : editing
                        ? "Save Changes"
                        : "Save Customer"}
                  </button>
                </div>
              </form>
            )}

            {view === "profile" && profile && (
              <div className="customer-content">
                <div className="customer-profile-heading">
                  <span className="customer-profile-avatar">
                    {(profile.name || "C").charAt(0).toUpperCase()}
                  </span>

                  <div className="customer-profile-name">
                    <h3>{profile.name}</h3>
                    <p>{profile.whatsappNumber}</p>
                    <small>
                      Customer since {formatDate(profile.createdAt)}
                    </small>
                  </div>

                  <button
                    type="button"
                    className="customer-secondary"
                    onClick={editCustomer}
                  >
                    Edit
                  </button>
                </div>

                <div className="customer-details">
                  <div>
                    <span>Gender</span>
                    <strong>{profile.gender || "—"}</strong>
                  </div>

                  <div>
                    <span>Date of Birth</span>
                    <strong>{formatDate(profile.dateOfBirth)}</strong>
                  </div>

                  <div>
                    <span>Anniversary</span>
                    <strong>{formatDate(profile.anniversaryDate)}</strong>
                  </div>

                  <div className="full">
                    <span>Address</span>
                    <strong>{profile.address || "Not provided"}</strong>
                  </div>
                </div>

                <div className="customer-actions">
                  <button
                    type="button"
                    className="customer-secondary"
                    onClick={() => {
                      setView("directory");
                      setProfile(null);
                      setError("");
                      setNotice("");
                    }}
                  >
                    ← All Customers
                  </button>

                  <a
                    className="customer-primary customer-whatsapp"
                    href={`https://wa.me/${String(
                      profile.whatsappNumber || ""
                    ).replace(/\D/g, "")}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open WhatsApp ↗
                  </a>
                </div>
              </div>
            )}
          </section>
        </div>
      )}
    </>
  );
}
