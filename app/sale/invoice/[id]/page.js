"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import "./invoice.css";

const money = (value) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(Number(value || 0));

const dateText = (value) =>
  value
    ? new Date(value).toLocaleString("en-IN", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Asia/Kolkata",
      })
    : "—";

export default function InvoicePage() {
  const { id } = useParams();

  const [sale, setSale] = useState(null);
  const [seller, setSeller] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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

  function sendWhatsApp() {
    const rawNumber = String(
      sale?.customerSnapshot?.whatsappNumber || ""
    ).replace(/\D/g, "");

    if (!rawNumber) {
      alert("This customer does not have a saved WhatsApp number.");
      return;
    }

    const phone =
      rawNumber.length === 10 ? `91${rawNumber}` : rawNumber;

    const message = [
      "Thank you for shopping with Sivaah!",
      `Invoice: ${sale.billNumber}`,
      `Date: ${dateText(sale.createdAt)}`,
      `Invoice amount: ${money(sale.netAmount)}`,
      `Amount paid: ${money(sale.amountPaid)}`,
      `Balance due: ${money(sale.balance)}`,
      "",
      "Please contact the outlet if you need a copy of your invoice PDF.",
    ].join("\n");

    window.open(
      `https://wa.me/${phone}?text=${encodeURIComponent(message)}`,
      "_blank",
      "noopener,noreferrer"
    );
  }

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

  return (
    <main className="inv-page">
      <div className="inv-actions no-print">
        <button onClick={() => window.print()}>
          Download / Print PDF
        </button>

        <button className="inv-whatsapp" onClick={sendWhatsApp}>
          Send Summary on WhatsApp
        </button>

        <button
          className="inv-back"
          onClick={() => (window.location.href = "/sale")}
        >
          New Sale
        </button>
      </div>

      <article className="inv-paper">
        <header className="inv-header">
          <div>
            <div className="inv-logo">SIVAAH</div>
            <div className="inv-tagline">925 FINE SILVER JEWELS</div>
          </div>

          <div className="inv-meta">
            <h1>TAX INVOICE</h1>
            <p><b>Invoice No:</b> {sale.billNumber}</p>
            <p><b>Date:</b> {dateText(sale.createdAt)}</p>
          </div>
        </header>

        <div className="inv-parties">
          <section>
            <h3>SELLER</h3>
            <b>{seller?.legalName || "Shri Narain Jewellers"}</b>
            <p>{seller?.address || "Seller address not configured"}</p>
            <p>
              <b>GSTIN:</b>{" "}
              {seller?.gstin || "09AAWHS3038L1ZB"}
            </p>

            {seller?.phone && <p><b>Phone:</b> {seller.phone}</p>}
            {seller?.email && <p><b>Email:</b> {seller.email}</p>}
            {seller?.outletAddress && (
              <p><b>Outlet:</b> {seller.outletAddress}</p>
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

        <div className="inv-table-wrap">
          <table className="inv-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Description</th>
                <th>HSN</th>
                <th>Qty</th>
                <th>Weight</th>
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
                    <small>{item.sku}</small>
                    {item.batchId && (
                      <small>Batch: {item.batchId}</small>
                    )}
                  </td>
                  <td>{item.hsnCode || "7113"}</td>
                  <td>1</td>
                  <td>{Number(item.weight || 0).toFixed(3)} g</td>
                  <td>{money(item.listPrice)}</td>
                  <td>{money(item.discountAmount)}</td>
                  <td>{money(item.finalPrice)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="inv-lower">
          <section>
            <h3>PAYMENT DETAILS</h3>
            <p><b>Method:</b> {sale.paymentMethod || "—"}</p>

            {(sale.paymentSummary || []).map((payment, index) => (
              <p key={index}>
                {payment.method}: {money(payment.amount)}
              </p>
            ))}

            <p>
              <b>Salesperson:</b> {sale.salespersonName || "—"}
            </p>

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

            <div>
              <span>Amount paid</span>
              <b>{money(sale.amountPaid)}</b>
            </div>

            <div className="inv-due">
              <span>Balance due</span>
              <b>{money(sale.balance)}</b>
            </div>
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