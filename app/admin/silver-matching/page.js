
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

const money = (value) =>
  `₹${Number(value || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const grams = (value) =>
  `${Number(value || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  })} g`;

const dateText = (value) => {
  if (!value) return "—";
  const date = new Date(value);
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

const styles = `
  .sm-page {
    color: #172033;
    max-width: 1500px;
    margin: 0 auto;
    padding: 28px 26px 60px;
    font-family: inherit;
  }

  .sm-top {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 18px;
    flex-wrap: wrap;
    margin-bottom: 24px;
  }

  .sm-eyebrow {
    font-size: 11px;
    letter-spacing: 2px;
    font-weight: 800;
    color: #8b7350;
    margin-bottom: 9px;
  }

  .sm-title {
    font-size: 30px;
    line-height: 1.15;
    font-weight: 800;
    margin: 0;
    color: #111827;
  }

  .sm-subtitle {
    margin: 9px 0 0;
    color: #687386;
    font-size: 14px;
    max-width: 760px;
    line-height: 1.6;
  }

  .sm-btn {
    border: 1px solid #d7dce4;
    border-radius: 11px;
    padding: 11px 16px;
    background: #fff;
    color: #172033;
    font-weight: 700;
    cursor: pointer;
  }

  .sm-btn.primary {
    background: #111827;
    color: #fff;
    border-color: #111827;
  }

  .sm-btn:disabled {
    opacity: .45;
    cursor: not-allowed;
  }

  .sm-cards {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 14px;
    margin: 22px 0;
  }

  .sm-card,
  .sm-panel {
    background: #fff;
    border: 1px solid #e5e8ee;
    border-radius: 16px;
    padding: 19px;
    box-shadow: 0 2px 8px rgba(20,30,50,.025);
  }

  .sm-card-label {
    font-size: 13px;
    color: #687386;
  }

  .sm-card-value {
    font-size: 27px;
    font-weight: 800;
    margin-top: 10px;
    color: #172033;
  }

  .sm-card-note {
    font-size: 12px;
    color: #8a93a3;
    margin-top: 7px;
    line-height: 1.45;
  }

  .sm-panel {
    margin-top: 18px;
    overflow: hidden;
  }

  .sm-panel-head {
    display: flex;
    justify-content: space-between;
    gap: 14px;
    align-items: flex-start;
    flex-wrap: wrap;
    margin-bottom: 14px;
  }

  .sm-panel h3 {
    font-size: 17px;
    margin: 0;
    font-weight: 800;
    color: #172033;
  }

  .sm-muted {
    font-size: 13px;
    color: #778195;
    line-height: 1.5;
    margin-top: 6px;
  }

  .sm-table-wrap {
    overflow-x: auto;
  }

  .sm-table {
    width: 100%;
    border-collapse: collapse;
    min-width: 760px;
    font-size: 13px;
  }

  .sm-table th {
    text-align: left;
    color: #748094;
    font-size: 11px;
    letter-spacing: .45px;
    text-transform: uppercase;
    padding: 12px 10px;
    border-bottom: 1px solid #e6e9ef;
    white-space: nowrap;
  }

  .sm-table td {
    padding: 13px 10px;
    border-bottom: 1px solid #eef0f4;
    vertical-align: top;
    color: #263247;
  }

  .sm-table tr:last-child td {
    border-bottom: 0;
  }

  .sm-pill {
    display: inline-flex;
    padding: 5px 9px;
    border-radius: 999px;
    background: #f1f4f8;
    color: #4b5565;
    font-size: 11px;
    font-weight: 700;
  }

  .sm-pill.warn {
    background: #fff5df;
    color: #946200;
  }

  .sm-pill.good {
    background: #eaf7ef;
    color: #207044;
  }

  .sm-alert {
    padding: 13px 15px;
    border-radius: 12px;
    background: #f7f8fa;
    border: 1px solid #e7eaf0;
    color: #4e596b;
    font-size: 13px;
    line-height: 1.55;
    margin: 16px 0;
  }

  .sm-alert.warning {
    background: #fff8e9;
    border-color: #f3dfb5;
    color: #795510;
  }

  .sm-alert.success {
    background: #eef8f1;
    border-color: #cfe8d6;
    color: #24633b;
  }

  .sm-actions {
    display: flex;
    gap: 10px;
    align-items: center;
    flex-wrap: wrap;
  }

  .sm-empty {
    padding: 24px;
    text-align: center;
    color: #7b8494;
    font-size: 13px;
  }

  .sm-result {
    border-left: 4px solid #3b8b5a;
    background: #f1f8f3;
    border-radius: 10px;
    padding: 15px;
    margin-top: 16px;
  }

  .sm-result strong {
    display: block;
    margin-bottom: 6px;
    color: #205d38;
  }

  @media(max-width:900px) {
    .sm-cards {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .sm-page {
      padding: 20px 14px 45px;
    }
  }

  @media(max-width:520px) {
    .sm-cards {
      grid-template-columns: 1fr 1fr;
      gap: 9px;
    }

    .sm-card {
      padding: 14px;
    }

    .sm-card-value {
      font-size: 21px;
    }

    .sm-title {
      font-size: 25px;
    }
  }
`;

export default function SilverMatchingPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [matching, setMatching] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  const loadData = useCallback(async (quiet = false) => {
    if (quiet) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    setError("");

    try {
      const response = await fetch(
        "/api/admin/silver-matching",
        {
          method: "GET",
          cache: "no-store",
        }
      );

      const payload = await response.json();

      if (!response.ok || !payload.success) {
        throw new Error(
          payload.message ||
            "Unable to load silver matching data."
        );
      }

      setData(payload);
    } catch (err) {
      setError(
        err.message ||
          "Unable to load silver matching data."
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Read-only FIFO preview.
  const preview = useMemo(() => {
    const sales = (data?.unmatchedSales || []).map(
      (item) => ({
        type: "sale",
        date: new Date(item.saleDate || 0),
        item,
        remaining: Math.round(
          Number(item.remainingGrams || 0) * 1000
        ),
      })
    );

    const receipts = (
      data?.availableReplacementStock || []
    )
      .filter(
        (item) =>
          item.rateAvailable &&
          Number(item.replacementSilverRatePerGram) > 0
      )
      .map((item) => ({
        type: "receipt",
        date: new Date(item.receivedDate || 0),
        item,
        remaining: Math.round(
          Number(item.remainingGrams || 0) * 1000
        ),
        rate: Number(
          item.replacementSilverRatePerGram
        ),
      }));

    const events = [...sales, ...receipts].sort(
      (a, b) => {
        const delta =
          a.date.getTime() - b.date.getTime();

        if (delta !== 0) return delta;
        if (a.type === b.type) return 0;

        return a.type === "sale" ? -1 : 1;
      }
    );

    const queue = [];
    const allocations = [];

    let adjustmentPaise = 0;
    let matchedMg = 0;

    for (const event of events) {
      if (event.type === "sale") {
        queue.push(event);
        continue;
      }

      let receiptRemaining = event.remaining;

      while (
        receiptRemaining > 0 &&
        queue.length > 0
      ) {
        const saleEvent = queue[0];

        const amountMg = Math.min(
          saleEvent.remaining,
          receiptRemaining
        );

        if (amountMg <= 0) {
          queue.shift();
          continue;
        }

        const saleRate = Number(
          saleEvent.item.saleSilverRatePerGram || 0
        );

        const adjustment = Math.round(
          (amountMg * (saleRate - event.rate)) / 10
        );

        const matchedGrams = Number(
          (amountMg / 1000).toFixed(3)
        );

        allocations.push({
          sale: saleEvent.item,
          receipt: event.item,
          matchedGrams,
          saleRate,
          replacementRate: event.rate,
          adjustment: adjustment / 100,
          date: event.date,
        });

        saleEvent.remaining -= amountMg;
        receiptRemaining -= amountMg;
        matchedMg += amountMg;
        adjustmentPaise += adjustment;

        if (saleEvent.remaining === 0) {
          queue.shift();
        }
      }
    }

    const remainingMg = queue.reduce(
      (total, item) => total + item.remaining,
      0
    );

    return {
      allocations,
      matchedGrams: Number(
        (matchedMg / 1000).toFixed(3)
      ),
      adjustment: adjustmentPaise / 100,
      remainingUnmatchedGrams: Number(
        (remainingMg / 1000).toFixed(3)
      ),
    };
  }, [data]);

  const runMatching = async () => {
    if (!preview.allocations.length) return;

    const confirmed = window.confirm(
      `Confirm FIFO matching?\n\n` +
      `${preview.allocations.length} allocation(s)\n` +
      `${grams(preview.matchedGrams)} matched\n` +
      `Estimated silver adjustment: ${money(preview.adjustment)}\n\n` +
      `This will create confirmed SilverMatch records. ` +
      `This action changes accounting data.`
    );

    if (!confirmed) return;

    setMatching(true);
    setError("");
    setResult(null);

    try {
      const response = await fetch(
        "/api/admin/silver-matching",
        {
          method: "POST",
          cache: "no-store",
        }
      );

      const payload = await response.json();

      if (!response.ok || !payload.success) {
        throw new Error(
          payload.message || "FIFO matching failed."
        );
      }

      setResult(payload.result || null);
      await loadData(true);
    } catch (err) {
      setError(
        err.message || "FIFO matching failed."
      );
    } finally {
      setMatching(false);
    }
  };

  const summary = data?.summary || {};

  return (
    <main className="sm-page">
      <style>{styles}</style>

      <div className="sm-top">
        <div>
          <div className="sm-eyebrow">
            SIVAAH · OUTLET CONTROL CENTRE
          </div>

          <h1 className="sm-title">
            Silver Matching
          </h1>

          <p className="sm-subtitle">
            Match sold silver with replacement stock
            receipts in chronological FIFO order.
            Review the allocation and silver price
            adjustment before confirming.
          </p>
        </div>

        <div className="sm-actions">
          <button
            className="sm-btn"
            onClick={() => loadData(true)}
            disabled={refreshing || loading}
          >
            {refreshing ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </div>

      {error && (
        <div className="sm-alert warning">
          {error}
        </div>
      )}

      <div className="sm-cards">
        <article className="sm-card">
          <div className="sm-card-label">
            Unmatched sale entries
          </div>
          <div className="sm-card-value">
            {loading
              ? "—"
              : Number(summary.unmatchedSalesCount || 0)}
          </div>
          <div className="sm-card-note">
            Completed sales waiting for replacement silver
          </div>
        </article>

        <article className="sm-card">
          <div className="sm-card-label">
            Silver owed
          </div>
          <div className="sm-card-value">
            {loading ? "—" : grams(summary.totalUnmatchedGrams)}
          </div>
          <div className="sm-card-note">
            Total sold grams not yet matched
          </div>
        </article>

        <article className="sm-card">
          <div className="sm-card-label">
            Eligible replacement stock
          </div>
          <div className="sm-card-value">
            {loading
              ? "—"
              : grams(summary.eligibleReplacementGrams)}
          </div>
          <div className="sm-card-note">
            Received stock with a valid silver rate
          </div>
        </article>

        <article className="sm-card">
          <div className="sm-card-label">
            Available stock entries
          </div>
          <div className="sm-card-value">
            {loading
              ? "—"
              : Number(summary.replacementEntriesCount || 0)}
          </div>
          <div className="sm-card-note">
            Receipts with remaining unmatched quantity
          </div>
        </article>
      </div>

      {/* UNMATCHED SALES */}

      <section className="sm-panel">
        <div className="sm-panel-head">
          <div>
            <h3>1. Unmatched sold jewellery</h3>
            <div className="sm-muted">
              Oldest sale is prioritised first.
              Partial matching is supported.
            </div>
          </div>

          <span className="sm-pill">
            FIFO sale queue
          </span>
        </div>

        {loading ? (
          <div className="sm-empty">
            Loading sales…
          </div>
        ) : (data?.unmatchedSales || []).length === 0 ? (
          <div className="sm-empty">
            No unmatched sold silver.
            Your replacement queue is clear.
          </div>
        ) : (
          <div className="sm-table-wrap">
            <table className="sm-table">
              <thead>
                <tr>
                  <th>Sale date</th>
                  <th>Product / bill</th>
                  <th>Batch</th>
                  <th>Sold</th>
                  <th>Matched</th>
                  <th>Remaining</th>
                  <th>Sale silver rate</th>
                </tr>
              </thead>

              <tbody>
                {data.unmatchedSales.map((item) => (
                  <tr key={item.saleLedgerEntryId}>
                    <td>{dateText(item.saleDate)}</td>

                    <td>
                      <strong>
                        {item.productName || "Jewellery"}
                      </strong>
                      <br />
                      <span className="sm-muted">
                        {item.billNumber} · {item.sku || "—"}
                      </span>
                    </td>

                    <td>{item.batchId || "—"}</td>
                    <td>{grams(item.totalGrams)}</td>
                    <td>{grams(item.matchedGrams)}</td>

                    <td>
                      <strong>
                        {grams(item.remainingGrams)}
                      </strong>
                    </td>

                    <td>
                      {money(item.saleSilverRatePerGram)}/g
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* REPLACEMENT RECEIPTS */}

      <section className="sm-panel">
        <div className="sm-panel-head">
          <div>
            <h3>2. Replacement silver receipts</h3>
            <div className="sm-muted">
              Only received stock-in ledger entries with
              a valid source silver rate are eligible.
            </div>
          </div>

          <span className="sm-pill">
            Receipt queue
          </span>
        </div>

        {loading ? (
          <div className="sm-empty">
            Loading receipts…
          </div>
        ) : (data?.availableReplacementStock || []).length === 0 ? (
          <div className="sm-empty">
            No eligible replacement receipts found.
            Record a stock purchase/receipt first.
          </div>
        ) : (
          <div className="sm-table-wrap">
            <table className="sm-table">
              <thead>
                <tr>
                  <th>Received date</th>
                  <th>Product / SKU</th>
                  <th>Batch</th>
                  <th>Received</th>
                  <th>Already matched</th>
                  <th>Available</th>
                  <th>Silver rate</th>
                  <th>Status</th>
                </tr>
              </thead>

              <tbody>
                {data.availableReplacementStock.map((item) => (
                  <tr key={item.replacementLedgerEntryId}>
                    <td>{dateText(item.receivedDate)}</td>

                    <td>
                      <strong>
                        {item.productName || "Stock receipt"}
                      </strong>
                      <br />
                      <span className="sm-muted">
                        {item.sku || "—"}
                      </span>
                    </td>

                    <td>{item.batchId || "—"}</td>
                    <td>{grams(item.totalGrams)}</td>
                    <td>{grams(item.matchedGrams)}</td>

                    <td>
                      <strong>
                        {grams(item.remainingGrams)}
                      </strong>
                    </td>

                    <td>
                      {item.rateAvailable
                        ? `${money(item.replacementSilverRatePerGram)}/g`
                        : "Rate missing"}
                    </td>

                    <td>
                      <span
                        className={`sm-pill ${
                          item.rateAvailable ? "good" : "warn"
                        }`}
                      >
                        {item.rateAvailable
                          ? "Eligible"
                          : "Not eligible"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* FIFO PREVIEW */}

      <section className="sm-panel">
        <div className="sm-panel-head">
          <div>
            <h3>3. FIFO matching preview</h3>
            <div className="sm-muted">
              Preview only. Nothing is saved until you confirm.
            </div>
          </div>

          <span
            className={`sm-pill ${
              preview.allocations.length ? "good" : ""
            }`}
          >
            {preview.allocations.length} proposed allocation(s)
          </span>
        </div>

        {preview.allocations.length === 0 ? (
          <div className="sm-empty">
            No match can be made yet. A receipt must be
            dated after the sale and have an eligible
            silver rate.
          </div>
        ) : (
          <div className="sm-table-wrap">
            <table className="sm-table">
              <thead>
                <tr>
                  <th>Sale / bill</th>
                  <th>Replacement receipt</th>
                  <th>Matched grams</th>
                  <th>Sale rate</th>
                  <th>Replacement rate</th>
                  <th>Adjustment</th>
                </tr>
              </thead>

              <tbody>
                {preview.allocations.map((item, index) => (
                  <tr
                    key={`${item.sale.saleLedgerEntryId}-${item.receipt.replacementLedgerEntryId}-${index}`}
                  >
                    <td>
                      <strong>
                        {item.sale.productName}
                      </strong>
                      <br />
                      <span className="sm-muted">
                        {item.sale.billNumber}
                      </span>
                    </td>

                    <td>
                      <strong>
                        {item.receipt.productName || "Stock receipt"}
                      </strong>
                      <br />
                      <span className="sm-muted">
                        {item.receipt.batchId || "—"}
                      </span>
                    </td>

                    <td>{grams(item.matchedGrams)}</td>
                    <td>{money(item.saleRate)}/g</td>
                    <td>{money(item.replacementRate)}/g</td>

                    <td
                      style={{
                        fontWeight: 800,
                        color:
                          item.adjustment >= 0
                            ? "#207044"
                            : "#b42318",
                      }}
                    >
                      {item.adjustment > 0 ? "+" : ""}
                      {money(item.adjustment)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="sm-alert">
          <strong>Adjustment formula:</strong>{" "}
          matched grams × (sale silver rate − replacement
          silver rate). Positive means gain; negative means
          loss. Labour, transport and other purchase charges
          are not part of this silver-rate adjustment.
        </div>

        {Number(summary.totalUnmatchedGrams || 0) >
          Number(summary.eligibleReplacementGrams || 0) && (
          <div className="sm-alert warning">
            Replacement stock is insufficient to cover all
            sold grams. FIFO will match only the available
            eligible quantity; the remaining grams stay
            unmatched.
          </div>
        )}

        {result && (
          <div className="sm-result">
            <strong>FIFO matching completed</strong>

            {result.createdMatches} allocation(s) ·{" "}
            {grams(result.matchedGrams)} matched · Silver
            adjustment {money(result.adjustment)} ·{" "}
            {grams(result.remainingUnmatchedGrams)} still
            unmatched.
          </div>
        )}

        <div
          className="sm-actions"
          style={{ marginTop: 16 }}
        >
          <button
            className="sm-btn primary"
            onClick={runMatching}
            disabled={
              loading ||
              matching ||
              preview.allocations.length === 0
            }
          >
            {matching
              ? "Confirming matches…"
              : `Confirm ${preview.allocations.length} FIFO match(es)`}
          </button>

          <span className="sm-muted">
            Confirmation creates permanent SilverMatch records.
          </span>
        </div>
      </section>

      {/* MATCH HISTORY */}

      <section className="sm-panel">
        <div className="sm-panel-head">
          <div>
            <h3>4. Recent match history</h3>
            <div className="sm-muted">
              Latest 100 confirmed and reversed match records,
              retained for audit.
            </div>
          </div>

          <span className="sm-pill">
            Audit trail
          </span>
        </div>

        {(data?.matchHistory || []).length === 0 ? (
          <div className="sm-empty">
            No silver matches have been confirmed yet.
          </div>
        ) : (
          <div className="sm-table-wrap">
            <table className="sm-table">
              <thead>
                <tr>
                  <th>Match date</th>
                  <th>Sale reference</th>
                  <th>Matched grams</th>
                  <th>Sale rate</th>
                  <th>Replacement rate</th>
                  <th>Adjustment</th>
                  <th>Status</th>
                </tr>
              </thead>

              <tbody>
                {data.matchHistory.map((item) => {
                  const adjustment =
                    Number(item.adjustmentPaise || 0) / 100;

                  return (
                    <tr key={String(item._id)}>
                      <td>{dateText(item.matchDate)}</td>

                      <td>
                        <strong>
                          {String(item.saleId || "").slice(-8) || "—"}
                        </strong>
                        <br />
                        <span className="sm-muted">
                          Piece{" "}
                          {String(item.pieceId || "").slice(-8) || "—"}
                        </span>
                      </td>

                      <td>{grams(item.matchedGrams)}</td>
                      <td>
                        {money(item.saleSilverRatePerGram)}/g
                      </td>
                      <td>
                        {money(item.replacementSilverRatePerGram)}/g
                      </td>

                      <td
                        style={{
                          fontWeight: 800,
                          color:
                            adjustment >= 0
                              ? "#207044"
                              : "#b42318",
                        }}
                      >
                        {adjustment > 0 ? "+" : ""}
                        {money(adjustment)}
                      </td>

                      <td>
                        <span
                          className={`sm-pill ${
                            item.status === "confirmed"
                              ? "good"
                              : "warn"
                          }`}
                        >
                          {item.status === "confirmed"
                            ? "Confirmed"
                            : "Reversed"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div
        className="sm-alert warning"
        style={{ marginTop: 18 }}
      >
        <strong>Important:</strong> This screen only matches
        silver receipts against earlier sales. It does not
        create a cash transaction, business expense, or
        stock movement. Review the preview carefully before
        confirming. Reversals remain visible in the audit
        history.
      </div>
    </main>
  );
}
