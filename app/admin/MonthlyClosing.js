"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

const money = (value) =>
    value == null
        ? "—"
        : `₹${Number(value).toLocaleString("en-IN", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        })}`;

const grams = (value) =>
    value == null
        ? "—"
        : `${Number(value).toLocaleString("en-IN", {
            minimumFractionDigits: 3,
            maximumFractionDigits: 3,
        })} g`;

const monthLabel = (key) => {
    if (!key) return "Unknown month";

    const [year, month] = key.split("-");

    return new Date(Number(year), Number(month) - 1, 1).toLocaleDateString(
        "en-IN",
        { month: "long", year: "numeric" }
    );
};

const currentMonth = () => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
};

const statusStyle = {
    draft: { background: "#fff7e8", color: "#9a6a16" },
    closed: { background: "#eaf5ee", color: "#287448" },
    reopened: { background: "#fceeee", color: "#a33b3b" },
    preview: { background: "#edf3f8", color: "#42617a" },
};

function Metric({ label, value }) {
    return (
        <div style={styles.metric}>
            <span style={styles.metricLabel}>{label}</span>
            <strong style={styles.metricValue}>{value ?? "—"}</strong>
        </div>
    );
}

function Section({ title, children }) {
    return (
        <section style={styles.section}>
            <h3 style={styles.sectionTitle}>{title}</h3>
            {children}
        </section>
    );
}

export default function MonthlyClosing() {
    const [history, setHistory] = useState([]);
    const [selectedId, setSelectedId] = useState(null);
    const [monthKey, setMonthKey] = useState(currentMonth());
    const [preview, setPreview] = useState(null);

    const [loadingHistory, setLoadingHistory] = useState(true);
    const [loadingPreview, setLoadingPreview] = useState(false);
    const [saving, setSaving] = useState(false);

    const [physicalCash, setPhysicalCash] = useState("");
    const [physicalSilver, setPhysicalSilver] = useState("");
    const [physicalBank, setPhysicalBank] = useState("");
    const [notes, setNotes] = useState("");

    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");

    const selected = useMemo(
        () => history.find((item) => item.id === selectedId) || null,
        [history, selectedId]
    );

    const loadHistory = useCallback(async () => {
        setLoadingHistory(true);
        setError("");

        try {
            const response = await fetch(
                "/api/admin/monthly-closing/history",
                {
                    cache: "no-store",
                    credentials: "same-origin",
                }
            );

            const result = await response.json();

            if (!response.ok || !result.success) {
                throw new Error(
                    result.message || "Unable to load closing history."
                );
            }

            const records = result.history || [];
            setHistory(records);

            return records;
        } catch (err) {
            setError(err.message || "Unable to load closing history.");
            return [];
        } finally {
            setLoadingHistory(false);
        }
    }, []);

    const loadPreview = useCallback(
    async (month) => {
        setLoadingPreview(true);
        setError("");
        setSuccess("");

        try {
            const response = await fetch(
                `/api/admin/monthly-closing?month=${encodeURIComponent(month)}`,
                {
                    method: "GET",
                    cache: "no-store",
                    credentials: "same-origin",
                }
            );

            const result = await response.json();

            if (!response.ok || !result.success) {
                throw new Error(
                    result.message || "Unable to calculate live preview."
                );
            }

            setPreview(result);
            return result;
        } catch (err) {
            setPreview(null);
            setError(err.message || "Unable to calculate live preview.");
            return null;
        } finally {
            setLoadingPreview(false);
        }
    },
    []
);

    useEffect(() => {
        let active = true;

        async function initialize() {
            const records = await loadHistory();

            if (!active) return;

            const first = records[0];

            if (first) {
                setSelectedId(first.id);
                setMonthKey(first.monthKey);

                setPhysicalCash(
                    first.physicalCounts?.cash != null
                        ? String(first.physicalCounts.cash)
                        : ""
                );
                setPhysicalBank(
                    first.physicalCounts?.bank != null
                        ? String(first.physicalCounts.bank)
                        : ""
                );
                setPhysicalSilver(
                    first.physicalCounts?.silverGrams != null
                        ? String(first.physicalCounts.silverGrams)
                        : ""
                );

                setNotes(first.notes || "");

                await loadPreview(first.monthKey);
            } else {
                await loadPreview(currentMonth());
            }
        }

        initialize();

        return () => {
            active = false;
        };
    }, [loadHistory, loadPreview]);

    function selectMonth(item) {
        setSelectedId(item.id);
        setMonthKey(item.monthKey);

        setPhysicalCash(
            item.physicalCounts?.cash != null
                ? String(item.physicalCounts.cash)
                : ""
        );
setPhysicalBank(
  item.physicalCounts?.bank != null
    ? String(item.physicalCounts.bank)
    : ""
);
        setPhysicalSilver(
            item.physicalCounts?.silverGrams != null
                ? String(item.physicalCounts.silverGrams)
                : ""
        );

        setNotes(item.notes || "");

        loadPreview(item.monthKey);
    }
    function handleMonthChange(value) {
        if (!value) return;

        setSelectedId(null);
        setMonthKey(value);
        setPreview(null);
        setPhysicalCash("");
        setPhysicalSilver("");
        setPhysicalBank("");
        setNotes("");
        setError("");
        setSuccess("");

        loadPreview(value);
    }
    async function refreshAll() {
        setSuccess("");
        await loadPreview(monthKey);
        await loadHistory();
    }

    function validatePhysicalCounts() {
  if (
    physicalCash.trim() === "" ||
    physicalBank.trim() === "" ||
    physicalSilver.trim() === ""
  ) {
    setError(
      "Enter actual physical cash, bank balance and physical silver count before proceeding."
    );
    return null;
  }

  const cash = Number(physicalCash);
  const bank = Number(physicalBank);
  const silver = Number(physicalSilver);

  if (
    !Number.isFinite(cash) ||
    cash < 0 ||
    !Number.isFinite(bank) ||
    bank < 0 ||
    !Number.isFinite(silver) ||
    silver < 0
  ) {
    setError("Enter valid physical cash, bank and silver counts.");
    return null;
  }

  return { cash, bank, silver };
}
    async function saveDraft() {
        setError("");
        setSuccess("");

        const counts = validatePhysicalCounts();
        if (!counts) return;

        if (preview?.isAlreadyClosed) {
            setError("This month is already closed.");
            return;
        }

        setSaving(true);

        try {
            const response = await fetch(
                `/api/admin/monthly-closing?month=${encodeURIComponent(monthKey)}`,
                {
                    method: "POST",
                    credentials: "same-origin",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        action: "save_draft",
                        physicalCashCount: counts.cash,
                        physicalBankCount: counts.bank,
                        physicalSilverCountGrams: counts.silver,
                        notes,
                    }),
                }
            );

            const result = await response.json();

            if (!response.ok || !result.success) {
                throw new Error(
                    result.message || "Unable to save monthly draft."
                );
            }

            setSuccess("Monthly draft saved successfully.");

            const records = await loadHistory();

            const updated = records.find(
                (item) => item.monthKey === monthKey
            );

            if (updated) setSelectedId(updated.id);

            await loadPreview(monthKey);
        } catch (err) {
            setError(err.message || "Unable to save monthly draft.");
        } finally {
            setSaving(false);
        }
    }

    async function closeMonth() {
        setError("");
        setSuccess("");

        if (preview?.isAlreadyClosed) {
            setError("This month is already closed.");
            return;
        }

        const counts = validatePhysicalCounts();
        if (!counts) return;

        const confirmed = window.confirm(
            `You are about to permanently close ${monthLabel(monthKey)}. The month will be locked and its closing balances will carry forward. Continue?`
        );

        if (!confirmed) return;

        setSaving(true);

        try {
            const response = await fetch(
                `/api/admin/monthly-closing?month=${encodeURIComponent(monthKey)}`,
                {
                    method: "POST",
                    credentials: "same-origin",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        action: "close",
                        physicalCashCount: counts.cash,
                         physicalBankCount: counts.bank,
                        physicalSilverCountGrams: counts.silver,
                        notes,
                    }),
                }
            );

            const result = await response.json();

            if (!response.ok || !result.success) {
                throw new Error(
                    result.message || "Unable to close this month."
                );
            }

            setSuccess(
                result.message ||
                `${monthLabel(monthKey)} successfully closed.`
            );

            const records = await loadHistory();

            const updated = records.find(
                (item) => item.monthKey === monthKey
            );

            if (updated) setSelectedId(updated.id);

            await loadPreview(monthKey);
        } catch (err) {
            setError(err.message || "Unable to close this month.");
        } finally {
            setSaving(false);
        }
    }

    const movement = preview?.movement || {};
    const profit = preview?.profit || {};
    const silverAdjustment = profit.silverAdjustment || {};
    const openingVerification = preview?.openingVerification || {};

    const paymentIssues = movement.salesWithPaymentIssues || [];

    const unallocated = Number(
        movement.unallocatedTransactionAmount || 0
    );

    const profitSales = profit.netSales ?? profit.salesRevenue ?? null;

    const confirmedProfit = profit.confirmedRealProfit ?? null;

    const estimatedProfit =
        profit.estimatedRealProfit ?? profit.operatingProfit ?? null;

    const hasIssues =
        paymentIssues.length > 0 || unallocated !== 0;

    return (
        <section style={styles.page}>
            <div style={styles.header}>
                <div>
                    <div style={styles.eyebrow}>FINANCIAL CONTROL</div>

                    <h2 style={styles.title}>Monthly Closing</h2>

                    <p style={styles.subtitle}>
                        Live financial preview, saved drafts and closing history.
                    </p>
                </div>

                <button
                    style={styles.secondaryButton}
                    onClick={refreshAll}
                    disabled={loadingPreview || loadingHistory}
                >
                    {loadingPreview
                        ? "Refreshing..."
                        : "↻ Refresh Live Preview"}
                </button>
            </div>

            <div style={styles.notice}>
                <strong>Live preview</strong>
                <span>
                    These figures are recalculated from the latest database
                    records. They are not saved until you select Save Draft.
                </span>
            </div>

            {error && <div style={styles.error}>{error}</div>}
            {success && <div style={styles.success}>{success}</div>}

            <div style={styles.toolbar}>
                <div>
                    <label style={styles.label}>Select accounting month</label>

                    <input
                        type="month"
                        value={monthKey}
                        min="2026-10"
                        max={currentMonth()}
                        onChange={(e) => handleMonthChange(e.target.value)}
                        style={styles.monthInput}
                    />

                    <div style={styles.helper}>
                        Selected: {monthLabel(monthKey)}
                    </div>
                </div>

                {preview && (
                    <span
                        style={{
                            ...styles.badge,
                            ...(statusStyle[preview.status] ||
                                statusStyle.preview),
                        }}
                    >
                        {preview.status || "LIVE PREVIEW"}
                    </span>
                )}
            </div>

            {loadingPreview && !preview ? (
                <div style={styles.empty}>
                    Calculating live monthly figures...
                </div>
            ) : preview ? (
                <>
                    <Section title="Live closing balances">
                        <div style={styles.metrics}>
                            <Metric
                                label="CASH"
                                value={money(preview.closing?.cash)}
                            />

                            <Metric
                                label="BANK"
                                value={money(preview.closing?.bank)}
                            />

                            <Metric
                                label="PHYSICAL SILVER"
                                value={grams(preview.closing?.silverGrams)}
                            />
                        </div>
                    </Section>

                    <Section title="Monthly movement">
                        <div style={styles.metrics}>
                            <Metric
                                label="SALES BILLS"
                                value={movement.salesBills ?? "—"}
                            />

                            <Metric
                                label="SALES COLLECTED"
                                value={money(movement.salesCollected)}
                            />

                            <Metric
                                label="MANUAL TRANSACTIONS"
                                value={movement.manualTransactions ?? "—"}
                            />

                            <Metric
                                label="SILVER LEDGER ENTRIES"
                                value={movement.silverLedgerEntries ?? "—"}
                            />

                            <Metric
                                label="SILVER IN"
                                value={grams(movement.silverInGrams)}
                            />

                            <Metric
                                label="SILVER OUT"
                                value={grams(movement.silverOutGrams)}
                            />

                            <Metric
                                label="NET SILVER MOVEMENT"
                                value={grams(movement.netSilverGrams)}
                            />
                        </div>
                    </Section>

                    <Section title="Profit summary">
                        <div style={styles.metrics}>
                            <Metric
                                label="NET SALES"
                                value={money(profitSales)}
                            />

                            <Metric
                                label="REPLACEMENT COST"
                                value={money(profit.replacementCost)}
                            />
                            <Metric
                                label="CONFIRMED SILVER ADJUSTMENT"
                                value={money(silverAdjustment.confirmed)}
                            />

                            <Metric
                                label="PROVISIONAL SILVER ADJUSTMENT"
                                value={money(silverAdjustment.provisional)}
                            />
                            <Metric
                                label="OPERATING MARGIN"
                                value={money(profit.operatingMargin)}
                            />

                            <Metric
                                label="OPERATING EXPENSES"
                                value={money(profit.operatingExpenses)}
                            />

                            <Metric
                                label="CONFIRMED REAL PROFIT"
                                value={money(confirmedProfit)}
                            />

                            <Metric
                                label="ESTIMATED REAL PROFIT"
                                value={money(estimatedProfit)}
                            />
                        </div>

                        {profit.note && (
                            <p style={styles.helper}>{profit.note}</p>
                        )}
                    </Section>
                    <Section title="Silver adjustment summary">
                        <div style={styles.metrics}>
                            <Metric
                                label="CONFIRMED ADJUSTMENT"
                                value={money(silverAdjustment.confirmed)}
                            />

                            <Metric
                                label="PROVISIONAL ADJUSTMENT"
                                value={money(silverAdjustment.provisional)}
                            />

                            <Metric
                                label="SILVER MATCHED"
                                value={grams(silverAdjustment.confirmedMatchedGrams)}
                            />

                            <Metric
                                label="UNMATCHED SOLD SILVER"
                                value={grams(silverAdjustment.unmatchedSoldGrams)}
                            />

                            <Metric
                                label="MATCHES CREATED THIS MONTH"
                                value={silverAdjustment.matchesCreatedInMonth ?? 0}
                            />

                            <Metric
                                label="REFERENCE SILVER RATE"
                                value={
                                    silverAdjustment.referenceSilverRatePerGram == null
                                        ? "—"
                                        : `${money(silverAdjustment.referenceSilverRatePerGram)}/g`
                                }
                            />
                        </div>

                        <p style={styles.helper}>
                            Confirmed silver adjustment is recognized in the month
                            the replacement silver is matched. Negative adjustment
                            reduces profit; positive adjustment increases profit.
                            Provisional adjustment is an estimate and is not confirmed profit.
                        </p>
                    </Section>
                    <Section title="Product-wise profit breakdown">
                        {!Array.isArray(profit.productProfitBreakdown) ||
                            profit.productProfitBreakdown.length === 0 ? (
                            <div style={styles.empty}>
                                No product-wise breakdown available for this month.
                            </div>
                        ) : (
                            <>
                                <p style={styles.helper}>
                                    Cost includes silver, source labour and ₹50
                                    packaging per piece. Item margin is selling
                                    price minus replacement cost. Bill-level
                                    discounts are not allocated individually.
                                </p>

                                <div style={styles.productList}>
                                    {profit.productProfitBreakdown.map(
                                        (item, index) => (
                                            <article
                                                key={`${item.billNumber || "bill"}-${index}`}
                                                style={styles.productCard}
                                            >
                                                <div style={styles.productHeader}>
                                                    <div>
                                                        <strong
                                                            style={styles.productName}
                                                        >
                                                            {item.productName ||
                                                                "Unknown product"}
                                                        </strong>

                                                        <div
                                                            style={styles.productMeta}
                                                        >
                                                            Bill:{" "}
                                                            {item.billNumber ||
                                                                "—"}{" "}
                                                            · Weight:{" "}
                                                            {grams(item.weight)}
                                                        </div>
                                                    </div>

                                                    <strong
                                                        style={styles.productMargin}
                                                    >
                                                        {money(
                                                            item.operatingMargin
                                                        )}
                                                    </strong>
                                                </div>

                                                <div style={styles.productGrid}>
                                                    <div>
                                                        <span
                                                            style={styles.productLabel}
                                                        >
                                                            Silver rate
                                                        </span>
                                                        <strong>
                                                            {money(
                                                                item.silverRateAtSale
                                                            )}
                                                            /g
                                                        </strong>
                                                    </div>

                                                    <div>
                                                        <span
                                                            style={styles.productLabel}
                                                        >
                                                            Silver cost
                                                        </span>
                                                        <strong>
                                                            {money(item.silverCost)}
                                                        </strong>
                                                    </div>

                                                    <div>
                                                        <span
                                                            style={styles.productLabel}
                                                        >
                                                            Labour / gram
                                                        </span>
                                                        <strong>
                                                            {item.labourPerGram ==
                                                                null
                                                                ? "Not available"
                                                                : money(
                                                                    item.labourPerGram
                                                                )}
                                                        </strong>
                                                    </div>

                                                    <div>
                                                        <span
                                                            style={styles.productLabel}
                                                        >
                                                            Labour cost
                                                        </span>
                                                        <strong>
                                                            {money(item.labourCost)}
                                                        </strong>
                                                    </div>

                                                    <div>
                                                        <span
                                                            style={styles.productLabel}
                                                        >
                                                            Packaging
                                                        </span>
                                                        <strong>
                                                            {money(
                                                                item.packagingCost
                                                            )}
                                                        </strong>
                                                    </div>

                                                    <div>
                                                        <span
                                                            style={styles.productLabel}
                                                        >
                                                            Replacement cost
                                                        </span>
                                                        <strong>
                                                            {money(
                                                                item.replacementCost
                                                            )}
                                                        </strong>
                                                    </div>

                                                    <div>
                                                        <span
                                                            style={styles.productLabel}
                                                        >
                                                            Selling price
                                                        </span>
                                                        <strong>
                                                            {money(
                                                                item.sellingPrice
                                                            )}
                                                        </strong>
                                                    </div>

                                                    <div>
                                                        <span
                                                            style={styles.productLabel}
                                                        >
                                                            Item margin
                                                        </span>
                                                        <strong>
                                                            {money(
                                                                item.operatingMargin
                                                            )}
                                                        </strong>
                                                    </div>
                                                </div>
                                            </article>
                                        )
                                    )}
                                </div>
                            </>
                        )}
                    </Section>

                    <Section title="Opening balances">
                        <div style={styles.metrics}>
                            <Metric
                                label="OPENING CASH"
                                value={money(preview.opening?.cash)}
                            />

                            <Metric
                                label="OPENING BANK"
                                value={money(preview.opening?.bank)}
                            />

                            <Metric
                                label="OPENING SILVER"
                                value={grams(preview.opening?.silverGrams)}
                            />
                        </div>
                    </Section>

                    <Section title="Reconciliation & validation">
                        <div style={styles.metrics}>
                            <Metric
                                label="UNALLOCATED TRANSACTIONS"
                                value={money(unallocated)}
                            />

                            <Metric
                                label="SALES PAYMENT ISSUES"
                                value={paymentIssues.length}
                            />

                            <Metric
                                label="OPENING CASH VERIFIED"
                                value={
                                    openingVerification.verified
                                        ? "Yes"
                                        : "No"
                                }
                            />

                            <Metric
                                label="OPENING SILVER VERIFIED"
                                value={
                                    openingVerification.silverCountVerified
                                        ? "Yes"
                                        : "No"
                                }
                            />
                        </div>

                        {hasIssues && (
                            <div style={styles.warning}>
                                <strong>
                                    Payment / allocation issues need attention
                                </strong>

                                {unallocated !== 0 && (
                                    <p>
                                        Unallocated transactions:{" "}
                                        {money(unallocated)}
                                    </p>
                                )}

                                {paymentIssues.map((issue, index) => (
                                    <p key={index}>
                                        Bill {issue.billNumber || "Unknown"}:{" "}
                                        {issue.reason || "Payment issue"}
                                    </p>
                                ))}
                            </div>
                        )}

                        {preview.warning && (
                            <p style={styles.helper}>{preview.warning}</p>
                        )}
                    </Section>

                    <Section title="Physical count & save draft">
                        <div style={styles.formGrid}>
                            <label style={styles.field}>
                                <span>
                                    Actual physical cash count (₹)
                                </span>

                                <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={physicalCash}
                                    onChange={(e) =>
                                        setPhysicalCash(e.target.value)
                                    }
                                    placeholder="Enter counted cash"
                                    style={styles.input}
                                />
                            </label>
<label style={styles.field}>
  <span>Actual bank balance (₹)</span>

  <input
    type="number"
    min="0"
    step="0.01"
    value={physicalBank}
    onChange={(e) => setPhysicalBank(e.target.value)}
    placeholder="Enter actual bank balance"
    style={styles.input}
  />
</label>
                            <label style={styles.field}>
                                <span>
                                    Actual physical silver count (grams)
                                </span>

                                <input
                                    type="number"
                                    min="0"
                                    step="0.001"
                                    value={physicalSilver}
                                    onChange={(e) =>
                                        setPhysicalSilver(e.target.value)
                                    }
                                    placeholder="Enter counted silver"
                                    style={styles.input}
                                />
                            </label>
                        </div>

                        <label style={styles.field}>
                            <span>Notes</span>

                            <textarea
                                value={notes}
                                onChange={(e) => setNotes(e.target.value)}
                                maxLength={2000}
                                rows={3}
                                placeholder="Add notes for this accounting month..."
                                style={styles.textarea}
                            />
                        </label>

                        <button
                            style={styles.primaryButton}
                            onClick={saveDraft}
                            disabled={
                                saving ||
                                loadingPreview ||
                                preview.isAlreadyClosed
                            }
                        >
                            {saving
                                ? "Saving Draft..."
                                : "Save Monthly Draft"}
                        </button>

                        <button
                            type="button"
                            style={{
                                ...styles.closeButton,
                                opacity:
                                    saving ||
                                        loadingPreview ||
                                        preview.isAlreadyClosed
                                        ? 0.55
                                        : 1,
                                cursor:
                                    saving ||
                                        loadingPreview ||
                                        preview.isAlreadyClosed
                                        ? "not-allowed"
                                        : "pointer",
                            }}
                            onClick={closeMonth}
                            disabled={
                                saving ||
                                loadingPreview ||
                                preview.isAlreadyClosed
                            }
                        >
                            {saving
                                ? "Processing..."
                                : "Finalize & Close Month"}
                        </button>

                        <p style={styles.helper}>
                            Closing is permanent through this screen. The
                            server will block it if cash or silver counts,
                            opening verification, payment allocation, negative
                            balances or previous-month requirements are unresolved.
                        </p>

                        {preview.isAlreadyClosed && (
                            <p style={styles.helper}>
                                This month is already closed. Draft changes are
                                disabled.
                            </p>
                        )}
                    </Section>
                </>
            ) : (
                <div style={styles.empty}>
                    No live preview available. Use Refresh Live Preview to try again.
                </div>
            )}

            <Section title="Saved closing history">
                {loadingHistory ? (
                    <div style={styles.empty}>Loading history...</div>
                ) : history.length === 0 ? (
                    <div style={styles.empty}>
                        No saved monthly drafts yet.
                    </div>
                ) : (
                    <div style={styles.historyList}>
                        {history.map((item) => (
                            <button
                                key={item.id}
                                onClick={() => selectMonth(item)}
                                style={{
                                    ...styles.monthButton,
                                    ...(selectedId === item.id
                                        ? styles.monthSelected
                                        : {}),
                                }}
                            >
                                <span style={styles.monthTop}>
                                    <strong>
                                        {monthLabel(item.monthKey)}
                                    </strong>

                                    <span
                                        style={{
                                            ...styles.badge,
                                            ...(statusStyle[item.status] ||
                                                statusStyle.draft),
                                        }}
                                    >
                                        {item.status}
                                    </span>
                                </span>

                                <span style={styles.monthMeta}>
                                    Sales {money(item.profit?.netSales)} ·
                                    Profit{" "}
                                    {money(
                                        item.profit?.estimatedRealProfit
                                    )}
                                </span>
                            </button>
                        ))}
                    </div>
                )}
            </Section>
        </section>
    );
}

const styles = {
    page: {
        width: "100%",
        color: "#252820",
    },

    header: {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 16,
        flexWrap: "wrap",
        marginBottom: 22,
    },

    eyebrow: {
        color: "#a78954",
        fontSize: 9,
        fontWeight: 700,
        letterSpacing: 1.5,
        marginBottom: 8,
    },

    title: {
        margin: 0,
        fontFamily: 'Georgia, "Times New Roman", serif',
        fontSize: 30,
        fontWeight: 400,
    },

    subtitle: {
        color: "#85877f",
        fontSize: 12,
        margin: "8px 0 0",
        lineHeight: 1.6,
    },

    notice: {
        display: "grid",
        gap: 5,
        padding: "13px 15px",
        background: "#fbf8f0",
        border: "1px solid #e7e0d1",
        borderRadius: 8,
        color: "#76684f",
        fontSize: 11,
        lineHeight: 1.6,
        marginBottom: 18,
    },

    toolbar: {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 12,
        padding: 15,
        background: "#fff",
        border: "1px solid #e8e9e4",
        borderRadius: 9,
        marginBottom: 18,
    },

    label: {
        display: "block",
        color: "#85877f",
        fontSize: 10,
        marginBottom: 5,
    },

    monthText: {
        fontSize: 15,
    },

    badge: {
        display: "inline-block",
        borderRadius: 20,
        padding: "5px 9px",
        fontSize: 9,
        fontWeight: 700,
        textTransform: "uppercase",
        whiteSpace: "nowrap",
    },

    section: {
        background: "#fff",
        border: "1px solid #e8e9e4",
        borderRadius: 10,
        padding: 17,
        marginBottom: 16,
    },

    sectionTitle: {
        margin: "0 0 13px",
        fontSize: 11,
        letterSpacing: 0.6,
        color: "#73766e",
        textTransform: "uppercase",
    },

    metrics: {
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(145px, 1fr))",
        gap: 9,
    },

    metric: {
        display: "grid",
        gap: 7,
        padding: 12,
        border: "1px solid #eceee9",
        borderRadius: 8,
        minWidth: 0,
    },

    metricLabel: {
        color: "#85877f",
        fontSize: 9,
        letterSpacing: 0.5,
    },

    metricValue: {
        color: "#292d27",
        fontSize: 14,
        overflowWrap: "anywhere",
    },

    helper: {
        color: "#85877f",
        fontSize: 11,
        lineHeight: 1.6,
        margin: "12px 0 0",
    },

    warning: {
        marginTop: 13,
        padding: 13,
        background: "#fff7e8",
        border: "1px solid #ead9b8",
        borderRadius: 8,
        color: "#805b20",
        fontSize: 11,
        lineHeight: 1.6,
    },

    error: {
        padding: 13,
        background: "#fff1f1",
        color: "#a33b3b",
        borderRadius: 8,
        fontSize: 12,
        marginBottom: 15,
    },

    success: {
        padding: 13,
        background: "#eaf5ee",
        color: "#287448",
        borderRadius: 8,
        fontSize: 12,
        marginBottom: 15,
    },

    formGrid: {
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
        gap: 12,
        marginBottom: 13,
    },

    field: {
        display: "grid",
        gap: 7,
        marginBottom: 13,
        color: "#73766e",
        fontSize: 11,
    },

    input: {
        width: "100%",
        boxSizing: "border-box",
        padding: "11px 12px",
        border: "1px solid #dfe3dc",
        borderRadius: 7,
        fontSize: 13,
        outlineColor: "#54775e",
        color: "#252820",
        background: "#fff",
    },

    textarea: {
        width: "100%",
        boxSizing: "border-box",
        padding: "11px 12px",
        border: "1px solid #dfe3dc",
        borderRadius: 7,
        fontSize: 12,
        resize: "vertical",
        outlineColor: "#54775e",
        color: "#252820",
        background: "#fff",
    },

    primaryButton: {
        padding: "12px 18px",
        border: 0,
        borderRadius: 7,
        background: "#315b43",
        color: "#fff",
        fontSize: 12,
        fontWeight: 600,
        cursor: "pointer",
    },

    closeButton: {
        padding: "12px 18px",
        marginLeft: 10,
        border: 0,
        borderRadius: 7,
        background: "#8a5b2d",
        color: "#fff",
        fontSize: 12,
        fontWeight: 700,
        cursor: "pointer",
    },

    secondaryButton: {
        padding: "10px 14px",
        borderRadius: 7,
        border: "1px solid #dce5dd",
        background: "#fff",
        color: "#315b43",
        cursor: "pointer",
        fontSize: 12,
        fontWeight: 600,
    },

    empty: {
        background: "#fff",
        border: "1px solid #e8e9e4",
        borderRadius: 10,
        padding: 24,
        color: "#777",
        fontSize: 13,
        marginBottom: 16,
    },

    historyList: {
        display: "grid",
        gap: 8,
    },

    monthButton: {
        display: "grid",
        gap: 8,
        width: "100%",
        padding: 14,
        textAlign: "left",
        border: "1px solid #eceee9",
        borderRadius: 8,
        background: "#fff",
        cursor: "pointer",
        color: "#252820",
    },

   monthSelected: {
    background: "#f6f8f5",
    border: "1px solid #54775e",
},

    monthTop: {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 8,
        fontSize: 12,
    },

    monthMeta: {
        fontSize: 10,
        color: "#888",
    },

    productList: {
        display: "grid",
        gap: 10,
        marginTop: 12,
    },

    productCard: {
        border: "1px solid #eceee9",
        borderRadius: 9,
        padding: 13,
        background: "#fff",
        minWidth: 0,
    },

    productHeader: {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-start",
        gap: 12,
        paddingBottom: 11,
        marginBottom: 11,
        borderBottom: "1px solid #eceee9",
    },

    productName: {
        display: "block",
        fontSize: 12,
        color: "#292d27",
        lineHeight: 1.5,
    },

    productMeta: {
        color: "#85877f",
        fontSize: 10,
        marginTop: 4,
    },

    productMargin: {
        color: "#315b43",
        fontSize: 14,
        whiteSpace: "nowrap",
    },

    productGrid: {
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
        gap: 12,
    },

    productLabel: {
        display: "block",
        color: "#85877f",
        fontSize: 9,
        marginBottom: 5,
    },
    monthInput: {
        padding: "10px 12px",
        border: "1px solid #dfe3dc",
        borderRadius: 7,
        fontSize: 15,
        fontWeight: 600,
        color: "#252820",
        background: "#fff",
        cursor: "pointer",
        minWidth: 190,
    },
};