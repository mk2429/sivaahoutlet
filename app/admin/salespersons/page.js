
"use client";

import { useCallback, useEffect, useState } from "react";
import "./salespersons.css";

const emptyForm = {
  name: "",
  mobile: "",
  address: "",
  joiningDate: "",
  remark: "",
};

function getLocalDate() {
  const now = new Date();
  const local = new Date(
    now.getTime() - now.getTimezoneOffset() * 60000
  );
  return local.toISOString().slice(0, 10);
}

function dateValue(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function displayDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export default function SalespersonsPage() {
  const [mounted, setMounted] = useState(false);
  const [salespersons, setSalespersons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [selected, setSelected] = useState(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const loadSalespersons = useCallback(async () => {
    setLoading(true);

    try {
      const response = await fetch("/api/admin/salespersons");
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Could not load salespersons.");
      }

      setSalespersons(data.salespersons || []);
      setError("");
    } catch (err) {
      setError(err.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (mounted) loadSalespersons();
  }, [mounted, loadSalespersons]);

  function updateField(event) {
    const { name, value } = event.target;
    setForm((previous) => ({ ...previous, [name]: value }));
  }

  function startAdd() {
    setForm({ ...emptyForm, joiningDate: getLocalDate() });
    setEditingId(null);
    setSelected(null);
    setMessage("");
    setError("");
    setShowForm(true);
  }

  async function startEdit(person) {
    setMessage("");
    setError("");

    try {
      const response = await fetch(
        `/api/admin/salespersons/${person._id}`
      );
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Could not open salesperson.");
      }

      const fullPerson = data.salesperson;

      setSelected(fullPerson);
      setEditingId(fullPerson._id);
      setForm({
        name: fullPerson.name || "",
        mobile: fullPerson.mobile || "",
        address: fullPerson.address || "",
        joiningDate: dateValue(fullPerson.joiningDate),
        remark: fullPerson.remark || "",
      });
      setShowForm(true);
    } catch (err) {
      setError(err.message || "Something went wrong.");
    }
  }

  async function viewDetails(person) {
    setMessage("");
    setError("");

    try {
      const response = await fetch(
        `/api/admin/salespersons/${person._id}`
      );
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Could not load details.");
      }

      setSelected(data.salesperson);
      setShowForm(false);
    } catch (err) {
      setError(err.message || "Something went wrong.");
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    setError("");

    try {
      const url = editingId
        ? `/api/admin/salespersons/${editingId}`
        : "/api/admin/salespersons";

      const response = await fetch(url, {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Could not save salesperson.");
      }

      setMessage(data.message || "Saved successfully.");
      setShowForm(false);

      if (data.salesperson) setSelected(data.salesperson);

      await loadSalespersons();
    } catch (err) {
      setError(err.message || "Something went wrong.");
    } finally {
      setSaving(false);
    }
  }

  const filtered = salespersons.filter((person) => {
    const query = search.toLowerCase().trim();

    return (
      !query ||
      person.name?.toLowerCase().includes(query) ||
      person.mobile?.includes(query) ||
      person.uniqueId?.toLowerCase().includes(query)
    );
  });

  if (!mounted) {
    return (
      <main className="sp-page">
        <p className="sp-empty">Loading Salespersons...</p>
      </main>
    );
  }

  return (
    <main className="sp-page">
        <button
  type="button"
  className="sp-back-button"
  onClick={() => (window.location.href = "/admin")}
>
  ← Back to Admin Dashboard
</button>
      <header className="sp-header">
        <div>
          <p className="sp-eyebrow">OUTLET MANAGEMENT</p>
          <h1 className="sp-title">Salespersons</h1>
          <p className="sp-subtitle">
            Add team members and manage their details.
          </p>
        </div>

        <button
          type="button"
          className="sp-primary"
          onClick={startAdd}
        >
          + Add Salesperson
        </button>
      </header>

      {message && (
        <div className="sp-success" role="status">{message}</div>
      )}

      {error && (
        <div className="sp-error" role="alert">{error}</div>
      )}

      <section className="sp-stats">
        <div className="sp-stat-card">
          <span>Total Salespersons</span>
          <strong>{salespersons.length}</strong>
        </div>

        <div className="sp-stat-card">
          <span>Search Results</span>
          <strong>{filtered.length}</strong>
        </div>
      </section>

      {showForm && (
        <section className="sp-panel">
          <div className="sp-panel-heading">
            <div>
              <h2>{editingId ? "Edit Salesperson" : "Add Salesperson"}</h2>
              <p>
                {editingId
                  ? `ID: ${selected?.uniqueId || "Loading…"}`
                  : "The system will generate a unique ID automatically."}
              </p>
            </div>

            <button
              type="button"
              className="sp-secondary"
              onClick={() => setShowForm(false)}
            >
              Close
            </button>
          </div>

          <form onSubmit={handleSubmit} className="sp-form">
            <label>
              Full Name *
              <input
                name="name"
                value={form.name}
                onChange={updateField}
                placeholder="Enter full name"
                required
                maxLength={100}
              />
            </label>

            <label>
              Mobile Number *
              <input
                name="mobile"
                value={form.mobile}
                onChange={updateField}
                placeholder="10-digit mobile number"
                inputMode="numeric"
                maxLength={10}
                pattern="[0-9]{10}"
                required
              />
            </label>

            <label>
              Joining Date *
              <input
                type="date"
                name="joiningDate"
                value={form.joiningDate}
                onChange={updateField}
                required
              />
            </label>

            <label className="sp-full">
              Address *
              <textarea
                name="address"
                value={form.address}
                onChange={updateField}
                placeholder="Enter full address"
                rows={3}
                required
                maxLength={500}
              />
            </label>

            <label className="sp-full">
              Remark <span className="sp-optional">(Optional)</span>
              <textarea
                name="remark"
                value={form.remark}
                onChange={updateField}
                placeholder="Any additional information"
                rows={2}
                maxLength={1000}
              />
            </label>

            <div className="sp-form-actions sp-full">
              <button
                type="button"
                className="sp-secondary"
                onClick={() => setShowForm(false)}
              >
                Cancel
              </button>

              <button
                type="submit"
                className="sp-primary"
                disabled={saving}
              >
                {saving
                  ? "Saving..."
                  : editingId
                  ? "Save Changes"
                  : "Add Salesperson"}
              </button>
            </div>
          </form>
        </section>
      )}

      {selected && !showForm && (
        <section className="sp-panel">
          <div className="sp-panel-heading">
            <div>
              <p className="sp-eyebrow">SALESPERSON PROFILE</p>
              <h2>{selected.name}</h2>
              <p>{selected.uniqueId}</p>
            </div>

            <div className="sp-inline-actions">
              <button
                type="button"
                className="sp-primary"
                onClick={() => startEdit(selected)}
              >
                Edit Details
              </button>

              <button
                type="button"
                className="sp-secondary"
                onClick={() => setSelected(null)}
              >
                Close
              </button>
            </div>
          </div>

          <div className="sp-details">
            <div>
              <span>Mobile</span>
              <strong>{selected.mobile}</strong>
            </div>

            <div>
              <span>Joining Date</span>
              <strong>{displayDate(selected.joiningDate)}</strong>
            </div>

            <div className="sp-detail-full">
              <span>Address</span>
              <strong>{selected.address}</strong>
            </div>

            <div className="sp-detail-full">
              <span>Remark</span>
              <strong>{selected.remark || "No remark added"}</strong>
            </div>

            <div>
              <span>Bills Recorded</span>
              <strong>{selected.bills?.length || 0}</strong>
            </div>
          </div>

          <p className="sp-note">
            Bills will appear here once the billing module is implemented.
          </p>
        </section>
      )}

      <section className="sp-panel">
        <div className="sp-list-heading">
          <div>
            <h2>All Salespersons</h2>
            <p>View profiles or edit existing details.</p>
          </div>

          <input
            className="sp-search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search name, mobile or ID..."
            aria-label="Search salespersons"
          />
        </div>

        {loading ? (
          <p className="sp-empty">Loading salespersons...</p>
        ) : filtered.length === 0 ? (
          <div className="sp-empty">
            <strong>No salespersons found</strong>
            <p>Add your first salesperson to get started.</p>
          </div>
        ) : (
          <div className="sp-table-wrap">
            <table className="sp-table">
              <thead>
                <tr>
                  <th>Salesperson</th>
                  <th>Unique ID</th>
                  <th>Mobile</th>
                  <th>Joining Date</th>
                  <th>Bills</th>
                  <th>Actions</th>
                </tr>
              </thead>

              <tbody>
                {filtered.map((person) => (
                  <tr key={person._id}>
                    <td>
                      <strong>{person.name}</strong>
                      <span className="sp-address">{person.address}</span>
                    </td>

                    <td>
                      <span className="sp-id">{person.uniqueId}</span>
                    </td>

                    <td>{person.mobile}</td>
                    <td>{displayDate(person.joiningDate)}</td>
                    <td>{person.billsCount ?? person.bills?.length ?? 0}</td>

                    <td>
                      <div className="sp-row-actions">
                        <button
                          type="button"
                          onClick={() => viewDetails(person)}
                        >
                          View
                        </button>

                        <button
                          type="button"
                          onClick={() => startEdit(person)}
                        >
                          Edit
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
