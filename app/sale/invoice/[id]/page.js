"use client";

import { Suspense } from "react";
import { useCallback, useEffect, useState, useRef } from "react";
import { useParams } from "next/navigation";
import "./invoice.css";

const money = (value) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  }).format(Math.round(Number(value) || 0));

const dateText = (value) =>
  value
    ? new Date(value).toLocaleString("en-IN", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Asia/Kolkata",
      })
    : "—";

function InvoiceContent() {
  const { id } = useParams();
  const invoiceRef = useRef(null);
  const [sharingPdf, setSharingPdf] = useState(false);
  const [sendingWp, setSendingWp] = useState(false);
  const [wpSent, setWpSent] = useState(false);
  const [sale, setSale] = useState(null);
  const [seller, setSeller] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function generateInvoicePdfBlob() {
    const html2pdf = (await import("html2pdf.js")).default;

    const options = {
      margin: [10, 10, 10, 10],
      filename: `${sale.billNumber || "Sivaah-Invoice"}.pdf`,
      image: { type: "jpeg", quality: 0.98 },
      html2canvas: {
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff",
        scrollY: 0,
      },
      jsPDF: {
        unit: "mm",
        format: "a4",
        orientation: "portrait",
      },
      pagebreak: {
        mode: ["css", "legacy"],
        avoid: [".inv-header", ".inv-parties", ".inv-lower", ".inv-footer"],
      },
    };

    return await html2pdf()
      .set(options)
      .from(invoiceRef.current)
      .outputPdf("blob");
  }

  async function shareInvoicePDF() {
    if (!invoiceRef.current || !sale) return;

    try {
      setSharingPdf(true);
      const pdfBlob = await generateInvoicePdfBlob();

      const file = new File(
        [pdfBlob],
        `${sale.billNumber || "Sivaah-Invoice"}.pdf`,
        { type: "application/pdf" }
      );

      if (
        navigator.share &&
        navigator.canShare &&
        navigator.canShare({ files: [file] })
      ) {
        await navigator.share({
          files: [file],
          title: "Sivaah Invoice",
          text: "Thank you for shopping with Sivaah ❤️",
        });
      } else {
        const url = URL.createObjectURL(pdfBlob);
        const link = document.createElement("a");
        link.href = url;
        link.download = file.name;
        link.click();
        URL.revokeObjectURL(url);
        alert("PDF downloaded. Please attach it manually in WhatsApp.");
      }
    } catch (err) {
      if (err.name !== "AbortError") {
        console.error("Invoice sharing failed:", err);
        alert("Could not share invoice. Please try again.");
      }
    } finally {
      setSharingPdf(false);
    }
  }

  async function sendWhatsApp() {
    if (!invoiceRef.current || !sale) return;

    const rawNumber = String(
      sale?.customerSnapshot?.whatsappNumber || ""
    ).replace(/\D/g, "");

    if (rawNumber.length < 10) {
      alert("This customer does not have a valid saved WhatsApp number.");
      return;
    }

    try {
      setSendingWp(true);
      setWpSent(false);

      const pdfBlob = await generateInvoicePdfBlob();
      const filename = `${sale.billNumber || "Sivaah-Invoice"}.pdf`;

      const formData = new FormData();
      formData.append("file", pdfBlob, filename);
      formData.append("customerPhone", rawNumber);
      formData.append(
        "customerName",
        sale.customerSnapshot?.name || "Customer"
      );
      formData.append("invoiceNo", sale.billNumber || id);
      formData.append(
        "totalPaid",
        String(Math.round(Number(sale.amountPaid ?? sale.netAmount) || 0))
      );

      const response = await fetch(`/api/outlet/sales/${id}/send-whatsapp`, {
        method: "POST",
        body: formData,
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Failed to send invoice on WhatsApp.");
      }

      setWpSent(true);
    } catch (err) {
      console.error("WhatsApp API invoice send failed:", err);
      alert(err.message || "Could not send bill on WhatsApp. Please try again.");
    } finally {
      setSendingWp(false);
    }
  }

  const loadInvoice = useCallback(async () => {
    if (!id) return;

    setLoading(true);
    setError("");

    try {
      const response = await fetch(`/api/outlet/sales/${id}`, {
        cache: "no-store",
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Could not load invoice.");
      }

      setSale(result.sale);
      setSeller(result.seller);
    } catch (err) {
      setError(err.message || "Could not load invoice.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadInvoice();
  }, [loadInvoice]);

  if (loading) {
    return <main className="inv-state">Loading invoice…</main>;
  }

  if (error) {
    return (
      <main className="inv-state">
        <h2>Unable to load invoice</h2>
        <p>{error}</p>
        <button onClick={loadInvoice}>Retry</button>
      </main>
    );
  }

  if (!sale) {
    return <main className="inv-state">Invoice not found.</main>;
  }

  const tax = sale.taxSnapshot || {};
  const items = sale.items || [];
  const replacedItems = sale.replacedItems || [];
  const replacementCredit = Math.round(Number(sale.replacementCredit) || 0);
  const walletUsed = Math.round(Number(sale.walletUsed) || 0);
  const walletCredited = Math.round(Number(sale.walletCredited) || 0);
  const netPayableAfterCredits = Math.max(
    0,
    Math.round(Number(sale.netAmount) || 0) - replacementCredit - walletUsed
  );
  const balance = Math.round(Number(sale.balance) || 0);

  return (
    <main className="inv-page">
      <div className="inv-actions no-print">
        <button onClick={() => window.print()}>Download / Print PDF</button>

        <button
          className="inv-whatsapp"
          onClick={sendWhatsApp}
          disabled={sendingWp}
        >
          {sendingWp
            ? "Sending Bill to WhatsApp..."
            : wpSent
            ? "Bill Sent on WhatsApp ✓"
            : "Send Bill on WhatsApp"}
        </button>

        <button
          className="inv-share-pdf"
          onClick={shareInvoicePDF}
          disabled={sharingPdf}
        >
          {sharingPdf ? "Preparing PDF..." : "Share Invoice PDF"}
        </button>

        <button
          className="inv-back"
          onClick={() => (window.location.href = "/sale")}
        >
          New Sale
        </button>
      </div>

      <article className="inv-paper" ref={invoiceRef}>
        <header className="inv-header">
          <div className="inv-brand">
            <img
              src="/sivaahlogo.jpeg"
              alt="Sivaah 925 Fine Silver Jewels"
              className="inv-brand-logo"
            />
          </div>

          <div className="inv-meta">
            <h1>{replacedItems.length > 0 ? "TAX / EXCHANGE INVOICE" : "TAX INVOICE"}</h1>
            <p>
              <b>Invoice No:</b> {sale.billNumber}
            </p>
            <p>
              <b>Date:</b> {dateText(sale.createdAt)}
            </p>
          </div>
        </header>

        <div className="inv-parties">
          <section>
            <h3>SELLER</h3>
            <b>{seller?.legalName || "Shri Narain Jewellers"}</b>

            {seller?.address && <p>{seller.address}</p>}

            <p>
              <b>GSTIN:</b> {seller?.gstin || "09AAWHS3038L1ZB"}
            </p>

            {seller?.phone && (
              <p>
                <b>Phone:</b> {seller.phone}
              </p>
            )}

            {seller?.email && (
              <p>
                <b>Email:</b> {seller.email}
              </p>
            )}

            {seller?.outletAddress && (
              <p>
                <b>Outlet:</b> {seller.outletAddress}
              </p>
            )}
          </section>

          <section>
            <h3>BILL TO</h3>
            <b>{sale.customerSnapshot?.name || "Walk-in Customer"}</b>

            {sale.customerSnapshot?.address && (
              <p>{sale.customerSnapshot.address}</p>
            )}

            {sale.customerSnapshot?.whatsappNumber && (
              <p>
                <b>Mobile:</b> {sale.customerSnapshot.whatsappNumber}
              </p>
            )}

            {sale.customerSnapshot?.gstin && (
              <p>
                <b>Customer GSTIN:</b> {sale.customerSnapshot.gstin}
              </p>
            )}
          </section>
        </div>

        {/* PURCHASED ITEMS TABLE */}
        <div className="inv-table-wrap">
          <table className="inv-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Description</th>
                <th>HSN</th>
                <th>Qty</th>
                <th>Price</th>
                <th>Discount</th>
                <th>Amount</th>
              </tr>
            </thead>

            <tbody>
              {items.map((item, index) => (
                <tr key={`${item.pieceId || item.sku}-${index}`}>
                  <td>{index + 1}</td>

                  <td>
                    <b>{item.name}</b>

                    {item.sku && <small>{item.sku}</small>}

                    {(item.batchId || item.weight != null) && (
                      <small className="inv-item-meta">
                        {item.batchId && `Batch: ${item.batchId}`}
                        {item.batchId && item.weight != null && " · "}
                        {item.weight != null &&
                          `Wt: ${Number(item.weight).toFixed(3)} g`}
                      </small>
                    )}
                  </td>

                  <td>{item.hsnCode || "7113"}</td>
                  <td>1</td>
                  <td>{money(item.listPrice)}</td>
                  <td>{money(item.discountAmount)}</td>
                  <td>{money(item.finalPrice)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* RETURNED / EXCHANGED ITEMS SECTION */}
        {replacedItems.length > 0 && (
          <div
            style={{
              marginTop: "14px",
              padding: "10px 12px",
              border: "1px solid #e5e7eb",
              borderRadius: "8px",
              background: "#fafafa",
            }}
          >
            <div
              style={{
                fontSize: "11px",
                fontWeight: 700,
                letterSpacing: "0.06em",
                color: "#374151",
                marginBottom: "6px",
              }}
            >
              EXCHANGE / RETURNED ITEMS ADJUSTED
            </div>

            <table className="inv-table" style={{ marginTop: 0 }}>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Returned Item</th>
                  <th>Original Bill</th>
                  <th>Weight</th>
                  <th>Exchange Credit</th>
                </tr>
              </thead>
              <tbody>
                {replacedItems.map((rep, idx) => (
                  <tr key={`${rep.pieceId || rep.sku}-${idx}`}>
                    <td>{idx + 1}</td>
                    <td>
                      <b>{rep.name}</b>
                      {rep.sku && <small>{rep.sku}</small>}
                    </td>
                    <td>{rep.originalBillNumber}</td>
                    <td>{Number(rep.weight || 0).toFixed(3)} g</td>
                    <td>− {money(rep.creditAmount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="inv-lower">
          <section>
            <h3>PAYMENT DETAILS</h3>

            <p>
              <b>Method:</b>{" "}
              {Number(sale.amountPaid) === 0 &&
              (replacementCredit > 0 || walletUsed > 0)
                ? "Adjusted via Exchange / Wallet"
                : sale.paymentMethod || "—"}
            </p>

            {(sale.paymentSummary || []).map((payment, index) => (
              <p key={index}>
                {payment.method}: {money(payment.amount)}
              </p>
            ))}

            <p>
              <b>Salesperson:</b> {sale.salespersonName || "—"}
            </p>

            {walletCredited > 0 && (
              <div
                style={{
                  marginTop: "8px",
                  padding: "8px 10px",
                  borderRadius: "6px",
                  background: "#ecfdf5",
                  border: "1px solid #a7f3d0",
                  color: "#065f46",
                  fontSize: "12px",
                }}
              >
                <b>Wallet Credit Added: +{money(walletCredited)}</b>
                <div>
                  Surplus exchange value has been credited to the customer&apos;s
                  Sivaah wallet for future purchases.
                </div>
              </div>
            )}

            <p className="inv-note">
              Please retain this invoice for your records.
            </p>
          </section>

          <section className="inv-totals">
            <div>
              <span>Gross amount</span>
              <b>{money(sale.grossAmount)}</b>
            </div>

            <div>
              <span>Discount</span>
              <b>− {money(sale.discountAmount)}</b>
            </div>

            <div>
              <span>Taxable value</span>
              <b>{money(tax.taxableValue)}</b>
            </div>

            <div>
              <span>CGST</span>
              <b>{money(tax.cgst)}</b>
            </div>

            <div>
              <span>SGST</span>
              <b>{money(tax.sgst)}</b>
            </div>

            {Number(tax.igst || 0) > 0 && (
              <div>
                <span>IGST</span>
                <b>{money(tax.igst)}</b>
              </div>
            )}

            <div className="inv-total">
              <span>Invoice total</span>
              <b>{money(sale.netAmount)}</b>
            </div>

            {replacementCredit > 0 && (
              <div>
                <span>Less: Exchange credit</span>
                <b>− {money(replacementCredit)}</b>
              </div>
            )}

            {walletUsed > 0 && (
              <div>
                <span>Less: Wallet redeemed</span>
                <b>− {money(walletUsed)}</b>
              </div>
            )}

            {(replacementCredit > 0 || walletUsed > 0) && (
              <div className="inv-total">
                <span>Net payable</span>
                <b>{money(netPayableAfterCredits)}</b>
              </div>
            )}

            <div>
              <span>Amount paid</span>
              <b>{money(sale.amountPaid)}</b>
            </div>

            {walletCredited > 0 && (
              <div>
                <span>Credited to wallet</span>
                <b>+ {money(walletCredited)}</b>
              </div>
            )}

            {balance > 0 && (
              <div className="inv-due">
                <span>Balance due</span>
                <b>{money(balance)}</b>
              </div>
            )}
          </section>
        </div>

        <footer className="inv-footer">
          <p>Electronically generated invoice</p>
          <b>Thank you for choosing Sivaah.</b>
        </footer>
      </article>
    </main>
  );
}

export default function InvoicePage() {
  return (
    <Suspense fallback={<main>Loading invoice...</main>}>
      <InvoiceContent />
    </Suspense>
  );
}