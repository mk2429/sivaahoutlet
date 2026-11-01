
"use client";

import { useEffect, useState } from "react";

const EMPTY_FORM = {
  cash: "0",
  bank: "0",
  supplierDues: "0",
  gstPayable: "0",
  customerAdvances: "0",
  physicalSilverGrams: "0",
  silverCountVerified: false,
  founders: [
    {
      founder: "Mayank",
      capitalContributed: "0",
      capitalReturned: "0",
      loanOutstanding: "0",
      notes: "",
    },
    {
      founder: "Krishna",
      capitalContributed: "0",
      capitalReturned: "0",
      loanOutstanding: "0",
      notes: "",
    },
  ],
  verificationNotes: "TEST DATA ONLY",
  sourceReferences: [],
};

const moneyFields = [
  ["cash", "Opening Cash (₹)"],
  ["bank", "Opening Bank Balance (₹)"],
  ["supplierDues", "Supplier Dues (₹)"],
  ["gstPayable", "GST Payable (₹)"],
  ["customerAdvances", "Customer Advances (₹)"],
];

function Field({ label, value, onChange, disabled = false }) {
  return (
    <label style={{ display: "grid", gap: 7 }}>
      <span style={{ fontSize: 13, fontWeight: 600 }}>{label}</span>
      <input
        type="number"
        min="0"
        step="0.01"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        style={{
          width: "100%",
          boxSizing: "border-box",
          padding: "11px 12px",
          border: "1px solid #ddd",
          borderRadius: 8,
          background: disabled ? "#f4f4f4" : "#fff",
          color: "#222",
        }}
      />
    </label>
  );
}

export default function OpeningBalances() {
  const [form, setForm] = useState(EMPTY_FORM);
  const [status, setStatus] = useState("loading");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [confirmation, setConfirmation] = useState("");

  async function loadData() {
    setStatus("loading");
    setError("");

    try {
      const response = await fetch("/api/admin/opening-balances", {
        cache: "no-store",
        credentials: "same-origin",
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.message || "Could not load opening balances.");
      }

      if (result.openingBalance) {
        const data = result.openingBalance;

        setForm({
          cash: String(data.cash ?? data.cashPaise / 100 ?? 0),
          bank: String(data.bank ?? data.bankPaise / 100 ?? 0),
          supplierDues: String(
            data.supplierDues ?? data.supplierDuesPaise / 100 ?? 0
          ),
          gstPayable: String(
            data.gstPayable ?? data.gstPayablePaise / 100 ?? 0
          ),
          customerAdvances: String(
            data.customerAdvances ??
              data.customerAdvancesPaise / 100 ??
              0
          ),
          physicalSilverGrams: String(data.physicalSilverGrams ?? 0),
          silverCountVerified: data.silverCountVerified === true,
          founders: ["Mayank", "Krishna"].map((name) => {
            const founder = (data.founders || []).find(
              (item) => item.founder === name
            );

            return {
              founder: name,
              capitalContributed: String(founder?.capitalContributed ?? 0),
              capitalReturned: String(founder?.capitalReturned ?? 0),
              loanOutstanding: String(founder?.loanOutstanding ?? 0),
              notes: founder?.notes || "",
            };
          }),
          verificationNotes: data.verificationNotes || "",
          sourceReferences: data.sourceReferences || [],
        });

        setStatus(result.status || (data.verified ? "verified" : "draft"));
      } else {
        setForm({ ...EMPTY_FORM, founders: EMPTY_FORM.founders.map((f) => ({ ...f })) });
        setStatus("not_started");
      }
    } catch (err) {
      setError(err.message || "Could not load opening balances.");
      setStatus("error");
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  function updateField(name, value) {
    setForm((previous) => ({ ...previous, [name]: value }));
  }

  function updateFounder(index, name, value) {
    setForm((previous) => ({
      ...previous,
      founders: previous.founders.map((founder, i) =>
        i === index ? { ...founder, [name]: value } : founder
      ),
    }));
  }

  async function saveDraft(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");

    try {
      const payload = {
        ...form,
        cash: Number(form.cash),
        bank: Number(form.bank),
        supplierDues: Number(form.supplierDues),
        gstPayable: Number(form.gstPayable),
        customerAdvances: Number(form.customerAdvances),
        physicalSilverGrams: Number(form.physicalSilverGrams),
        founders: form.founders.map((founder) => ({
          ...founder,
          capitalContributed: Number(founder.capitalContributed),
          capitalReturned: Number(founder.capitalReturned),
          loanOutstanding: Number(founder.loanOutstanding),
        })),
      };

      const response = await fetch("/api/admin/opening-balances", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.message || "Could not save draft.");
      }

      setStatus("draft");
      setMessage("Draft saved. These figures are not verified.");
      await loadData();
    } catch (err) {
      setError(err.message || "Could not save draft.");
    } finally {
      setBusy(false);
    }
  }

  async function verifyBalances() {
    if (!window.confirm(
      "Verify these opening balances? Make sure the cash, bank, liabilities, founder balances and physical silver have been checked."
    )) return;

    setBusy(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch("/api/admin/opening-balances", {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "verify",
          confirmation,
        }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.message || "Could not verify balances.");
      }

      setStatus("verified");
      setMessage("Opening balances verified.");
      await loadData();
    } catch (err) {
      setError(err.message || "Could not verify balances.");
    } finally {
      setBusy(false);
    }
  }

  const verified = status === "verified";
  const editable = !verified && status !== "loading" && status !== "error";

  const inputStyle = {
    width: "100%",
    boxSizing: "border-box",
    padding: 11,
    border: "1px solid #ddd",
    borderRadius: 8,
  };

  return (
    <section style={{ maxWidth: 1000, margin: "0 auto", color: "#222" }}>
      <div style={{ marginBottom: 22 }}>
        <div style={{ fontSize: 12, letterSpacing: 2, color: "#927343" }}>
          FINANCIAL SETUP
        </div>
        <h2 style={{ fontSize: 28, margin: "8px 0" }}>
          Opening Balances
        </h2>
        <p style={{ color: "#666", lineHeight: 1.6 }}>
          Starting position for the new financial books from 27 October 2026.
        </p>
      </div>

      <div style={{
        padding: 16,
        borderRadius: 10,
        background: verified ? "#eaf7ed" : "#fff5df",
        marginBottom: 20,
        border: "1px solid #e6e0d5",
      }}>
        <strong>
          {verified ? "Verified balances" :
            status === "loading" ? "Loading..." :
            status === "error" ? "Unable to load balances" :
            status === "not_started" ? "Not started" : "Draft / Testing Mode"}
        </strong>
        <p style={{ margin: "6px 0 0", fontSize: 13, lineHeight: 1.5 }}>
          {verified
            ? "Editing is disabled. A separate audited correction workflow is required."
            : "You can change these figures while they are a draft. Do not treat test figures as actual financial results."}
        </p>
      </div>

      {error && (
        <div role="alert" style={{ color: "#b42318", marginBottom: 14 }}>
          {error}
        </div>
      )}

      {message && (
        <div role="status" style={{ color: "#237443", marginBottom: 14 }}>
          {message}
        </div>
      )}

      <form onSubmit={saveDraft}>
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 16,
          padding: 20,
          border: "1px solid #e5e5e5",
          borderRadius: 12,
          marginBottom: 20,
        }}>
          <h3 style={{ gridColumn: "1 / -1", margin: 0 }}>
            Money and obligations
          </h3>

          {moneyFields.map(([name, label]) => (
            <Field
              key={name}
              label={label}
              value={form[name]}
              disabled={!editable || busy}
              onChange={(value) => updateField(name, value)}
            />
          ))}
        </div>

        <div style={{
          padding: 20,
          border: "1px solid #e5e5e5",
          borderRadius: 12,
          marginBottom: 20,
        }}>
          <h3 style={{ marginTop: 0 }}>Physical silver</h3>

          <Field
            label="Physical silver in stock (grams)"
            value={form.physicalSilverGrams}
            disabled={!editable || busy}
            onChange={(value) => updateField("physicalSilverGrams", value)}
          />

          <label style={{
            display: "flex",
            gap: 10,
            alignItems: "center",
            marginTop: 16,
          }}>
            <input
              type="checkbox"
              checked={form.silverCountVerified}
              disabled={!editable || busy}
              onChange={(event) =>
                updateField("silverCountVerified", event.target.checked)
              }
            />
            I have physically counted and checked this silver.
          </label>

          <p style={{ color: "#777", fontSize: 12 }}>
            This form does not add, remove or modify Silver Ledger entries.
          </p>
        </div>

        <div style={{
          padding: 20,
          border: "1px solid #e5e5e5",
          borderRadius: 12,
          marginBottom: 20,
        }}>
          <h3 style={{ marginTop: 0 }}>Founder balances</h3>

          {form.founders.map((founder, index) => (
            <div
              key={founder.founder}
              style={{
                padding: 14,
                border: "1px solid #eee",
                borderRadius: 10,
                marginBottom: 14,
              }}
            >
              <h4 style={{ marginTop: 0 }}>{founder.founder}</h4>

              <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                gap: 12,
              }}>
                {[
                  ["capitalContributed", "Capital contributed (₹)"],
                  ["capitalReturned", "Capital returned (₹)"],
                  ["loanOutstanding", "Loan outstanding (₹)"],
                ].map(([name, label]) => (
                  <Field
                    key={name}
                    label={label}
                    value={founder[name]}
                    disabled={!editable || busy}
                    onChange={(value) => updateFounder(index, name, value)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>

        <div style={{
          padding: 20,
          border: "1px solid #e5e5e5",
          borderRadius: 12,
          marginBottom: 20,
        }}>
          <label style={{ display: "grid", gap: 8 }}>
            <strong>Notes / source of figures</strong>
            <textarea
              value={form.verificationNotes}
              disabled={!editable || busy}
              onChange={(event) =>
                updateField("verificationNotes", event.target.value)
              }
              rows={3}
              style={{ ...inputStyle, resize: "vertical" }}
              placeholder="Example: cash counted, bank statement checked, supplier balance confirmed..."
            />
          </label>
        </div>

        {editable && (
          <button
            type="submit"
            disabled={busy}
            style={{
              padding: "12px 20px",
              border: 0,
              borderRadius: 8,
              background: "#252525",
              color: "#fff",
              fontWeight: 600,
              cursor: busy ? "wait" : "pointer",
            }}
          >
            {busy ? "Saving..." : "Save Draft"}
          </button>
        )}
      </form>

      {editable && (
        <div style={{
          padding: 20,
          marginTop: 20,
          border: "1px solid #e5e5e5",
          borderRadius: 12,
        }}>
          <h3 style={{ marginTop: 0 }}>Verify opening balances</h3>
          <p style={{ color: "#666", lineHeight: 1.6 }}>
            Only verify once the figures are accurate. Verification locks this
            draft; corrections will need a separate audited workflow.
          </p>

          <label style={{ display: "grid", gap: 8 }}>
            <strong>Confirmation message</strong>
            <input
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              placeholder="I checked the balances against actual records"
              style={inputStyle}
              disabled={busy}
            />
          </label>

          <button
            type="button"
            disabled={busy || !confirmation.trim() || !form.silverCountVerified}
            onClick={verifyBalances}
            style={{
              marginTop: 14,
              padding: "12px 20px",
              border: 0,
              borderRadius: 8,
              background: "#237443",
              color: "#fff",
              fontWeight: 600,
              cursor: busy ? "wait" : "pointer",
              opacity: !confirmation.trim() || !form.silverCountVerified ? 0.5 : 1,
            }}
          >
            Verify Opening Balances
          </button>
        </div>
      )}

      <button
        type="button"
        onClick={loadData}
        disabled={busy}
        style={{
          marginTop: 20,
          padding: "10px 14px",
          border: "1px solid #ddd",
          borderRadius: 8,
          background: "#fff",
          cursor: "pointer",
        }}
      >
        Refresh
      </button>
    </section>
  );
}
