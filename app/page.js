
"use client";

import { useEffect, useMemo, useState } from "react";
import "./outlet-dashboard.css";
import CustomerManager from "./CustomerManager";
const money = (value) =>
  Number(value || 0).toLocaleString("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  });

async function fetchJson(url) {
  const response = await fetch(url, { cache: "no-store" });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.message || `Request failed (${response.status})`);
  }

  return data;
}

export default function OutletDashboard() {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [sort, setSort] = useState("name");
  const [products, setProducts] = useState([]);
  const [collections, setCollections] = useState(null);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [loadingCollections, setLoadingCollections] = useState(false);
  const [error, setError] = useState("");
  const [today, setToday] = useState("");

  useEffect(() => {
    setToday(
      new Date().toLocaleDateString("en-IN", {
        weekday: "short",
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    );

    let active = true;

    async function loadProducts() {
      try {
        setLoadingProducts(true);
        setError("");

        const data = await fetchJson("/api/outlet/products");
        if (!data.success) {
          throw new Error(data.message || "Inventory unavailable");
        }

        if (active) setProducts(data.products || []);
      } catch (err) {
        if (active) setError(err.message);
      } finally {
        if (active) setLoadingProducts(false);
      }
    }

    loadProducts();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!selectedProduct) return;

    function handleKeyDown(event) {
      if (event.key === "Escape") setSelectedProduct(null);
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedProduct]);

 async function loadCollections() {
  // Open the tab immediately so the browser doesn't block it.
  const whatsappWindow = window.open("about:blank", "_blank");

  setLoadingCollections(true);
  setError("");

  try {
    const data = await fetchJson("/api/outlet/daily-collections");

    if (!data.success || !data.report) {
      throw new Error("The collections report is unavailable.");
    }

    const report = data.report;
    setCollections(report);

    if (!whatsappWindow) {
      throw new Error(
        "WhatsApp tab was blocked. Allow pop-ups and try again."
      );
    }

    const message = buildWhatsAppMessage(report);

    whatsappWindow.location.href =
      `https://wa.me/?text=${encodeURIComponent(message)}`;

  } catch (err) {
    if (whatsappWindow && !whatsappWindow.closed) {
      whatsappWindow.close();
    }

    setError(err.message);
  } finally {
    setLoadingCollections(false);
  }
}
function buildWhatsAppMessage(report) {
  const lines = [
    "SIVAAH | DAILY COLLECTION REPORT",
    `Date: ${report.date}`,
    "",
    "SALES SUMMARY",
    `Bills: ${report.billCount}`,
    `Gross sales: ${money(report.grossSales)}`,
    `Discounts: ${money(report.discounts)}`,
    `Net sales: ${money(report.netSales)}`,
    "",
    "PAYMENT COLLECTIONS",
    `Cash received: ${money(report.cash)}`,
    `UPI received: ${money(report.upi)}`,
    `Card: ${money(report.card)}`,
    `Bank transfer: ${money(report.bankTransfer)}`,
    `Other: ${money(report.otherPayments)}`,
    `Total collected: ${money(report.totalCollected)}`,
    `Outstanding: ${money(report.outstanding)}`,
    "",
    "PRODUCTS SOLD",
    ...(report.bills || []).map((bill) =>
      `${bill.billNumber} | ${bill.time} | ${bill.customerName} | ${bill.paymentSummary} | Bill: ${money(bill.netAmount)} | Paid: ${money(bill.amountPaid)}`
    ),
    "",
    "EXPENSES",
    `Total expenses: ${money(report.expenses)}`,
    `Net cash movement: ${money(report.netCashMovement)}`,
    "",
    "Generated from Sivaah Outlet System",
  ];

  return lines.join("\n");
}
  
function sendWhatsAppReport() {
  if (!collections) return;

  const message = buildWhatsAppMessage(collections);

  // Open the report first so you can copy it.
  const whatsappUrl =
    `https://wa.me/?text=${encodeURIComponent(message)}`;

  window.open(
    whatsappUrl,
    "_blank",
    "noopener,noreferrer"
  );
}


  const categories = useMemo(
    () => ["All", ...new Set(products.map((p) => p.category || "Uncategorised"))],
    [products]
  );

  const filteredProducts = useMemo(() => {
    const query = search.trim().toLowerCase();

    const result = products.filter((product) => {
      const searchable = [
        product.name,
        product.sku,
        product.barcode,
        product.batchId,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      const matchesSearch = searchable.includes(query);
      const matchesCategory =
        category === "All" ||
        (product.category || "Uncategorised") === category;

      return matchesSearch && matchesCategory;
    });

    result.sort((a, b) => {
      if (sort === "priceLow") return a.sp - b.sp;
      if (sort === "priceHigh") return b.sp - a.sp;
      if (sort === "weightLow") return a.weight - b.weight;
      if (sort === "weightHigh") return b.weight - a.weight;
      return a.name.localeCompare(b.name);
    });

    return result;
  }, [products, search, category, sort]);

  const selectedOffers = selectedProduct?.discountOffers || [];

  return (
    <main className="outlet-page">
      <header className="outlet-header">
        
        <nav className="header-actions">
          <CustomerManager />

          <a className="header-sale" href="/sale">
            <span>＋</span> Add Sale
          </a>

          <button
            className="header-collection"
            onClick={loadCollections}
            disabled={loadingCollections}
          >
            <span>₹</span>
            {loadingCollections ? "Loading…" : "Daily Collection"}
          </button>
        </nav>
      </header>

      <section className="inventory-section">
        <div className="inventory-heading">
          <div>
            <p className="eyebrow">OUTLET INVENTORY</p>
            <h1>Find Jewellery</h1>
            <p>Search by name, SKU, barcode or batch ID.</p>
          </div>

          <span className="inventory-count">
            {loadingProducts ? "Loading…" : `${filteredProducts.length} pieces`}
          </span>
        </div>

        <label className="product-search">
          <span aria-hidden="true">⌕</span>
          <input
            type="search"
            placeholder="Search jewellery, SKU or batch ID…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            autoComplete="off"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              aria-label="Clear search"
            >
              ×
            </button>
          )}
        </label>

        <div className="inventory-controls">
          <label>
            <span>Category</span>
            <select
              value={category}
              onChange={(event) => setCategory(event.target.value)}
            >
              {categories.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
          </label>

          <label>
            <span>Sort by</span>
            <select
              value={sort}
              onChange={(event) => setSort(event.target.value)}
            >
              <option value="name">Name: A–Z</option>
              <option value="priceLow">Price: Low to high</option>
              <option value="priceHigh">Price: High to low</option>
              <option value="weightLow">Weight: Low to high</option>
              <option value="weightHigh">Weight: High to low</option>
            </select>
          </label>
        </div>

        {error && <div className="outlet-error" role="alert">{error}</div>}

        {loadingProducts ? (
          <div className="inventory-message">Loading available jewellery…</div>
        ) : filteredProducts.length === 0 ? (
          <div className="inventory-message">
            <strong>
              {error ? "Inventory could not be loaded" : "No matching pieces found"}
            </strong>
            <p>
              {error
                ? "Check the error above and try again."
                : "Try another search term or category."}
            </p>
          </div>
        ) : (
          <div className="product-list">
            {filteredProducts.map((product) => (
              <article className="product-row" key={product.pieceId}>
                <div className="row-photo">
                  {product.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={product.image} alt={product.name} loading="lazy" />
                  ) : (
                    <div className="row-photo-placeholder">925</div>
                  )}
                </div>

                <div className="row-details">
                  <strong className="row-product-name">
                    {product.name || "Silver Jewellery"}
                  </strong>
                  <span>SKU: {product.sku || "—"}</span>
                  <span>Batch: {product.batchId || "—"}</span>
                </div>

                <div className="row-weight">
                  <span>Weight</span>
                  <strong>{product.weight} g</strong>
                </div>

                <div className="row-price">
                  <span>Price</span>
                  <strong>{money(product.sp)}</strong>
                  {product.discountOffers?.length > 0 && (
                    <small>{product.discountOffers.length} offer(s)</small>
                  )}
                </div>

                <div className="row-actions">
                  <button
                    type="button"
                    className="rates-button "
                    onClick={() => setSelectedProduct(product)}
                  >
                    Check Rates
                    <span>&amp; Discounts</span>
                  </button>

                  {/* <a
                    className="product-select"
                    href={`/sale?sku=${encodeURIComponent(product.sku || "")}&pieceId=${encodeURIComponent(product.pieceId || "")}`}
                  >
                    Select
                    <span>→</span>
                  </a> */}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {selectedProduct && (
        <div
          className="rates-overlay"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setSelectedProduct(null);
            }
          }}
        >
          <section
            className="rates-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="rates-modal-title"
          >
            <header className="rates-modal-header">
              <div>
                <p className="eyebrow">PRICE & OFFERS</p>
                <h2 id="rates-modal-title">Rates & Discounts</h2>
                <p>{selectedProduct.name}</p>
                <small>
                  SKU: {selectedProduct.sku || "—"} · Batch: {selectedProduct.batchId || "—"}
                </small>
              </div>

              <button
                className="modal-close"
                type="button"
                onClick={() => setSelectedProduct(null)}
                aria-label="Close rates popup"
              >
                ×
              </button>
            </header>

            <div className="modal-standard-price">
              <span>Standard selling price</span>
              <strong>{money(selectedProduct.sp)}</strong>
              <small>Weight: {selectedProduct.weight} g</small>
            </div>

            <div className="rates-modal-body">
              <h3>Available offers</h3>

              {selectedOffers.length === 0 ? (
                <div className="no-offers">
                  <strong>No matching offers right now</strong>
                  <p>The standard selling price applies to this piece.</p>
                </div>
              ) : (
                selectedOffers.map((offer) => (
                  <article className="offer-card" key={offer.id}>
                    <div className="offer-card-heading">
                      <div>
                        <strong>{offer.name}</strong>
                        <span>
                          {offer.type === "percentage"
                            ? `${offer.value}% off`
                            : `${money(offer.value)} off`}
                        </span>
                      </div>
                      <div className="offer-card-price">
                        <strong>{money(offer.price)}</strong>
                        <small>Indicative price</small>
                      </div>
                    </div>

                    <div className="offer-savings">
                      Potential saving: {money(offer.amountOff)}
                    </div>

                    <div className="offer-criteria">
                      <strong>Offer criteria</strong>
                      <ul>
                        {(offer.criteria || []).map((criterion, index) => (
                          <li key={`${offer.id}-${index}`}>{criterion}</li>
                        ))}
                      </ul>
                    </div>

                    {offer.requiresBillCheck && (
                      <p className="offer-condition-note">
                        Final eligibility depends on the complete bill and the offer criteria.
                      </p>
                    )}
                  </article>
                ))
              )}
            </div>

            <footer className="rates-modal-footer">
              <button
                type="button"
                className="modal-back-button"
                onClick={() => setSelectedProduct(null)}
              >
                ← Back to inventory
              </button>
              <button
                type="button"
                className="modal-done-button"
                onClick={() => setSelectedProduct(null)}
              >
                Close
              </button>
            </footer>
          </section>
        </div>
      )}

      {collections && (
        <section className="collection-panel">
          <div className="collection-heading">
            <div>
              <p className="eyebrow">END-OF-DAY REPORT</p>
              <h2>Today&apos;s Collections</h2>
              <p>Report date: {collections.date}</p>
            </div>
            <button className="whatsapp-button" onClick={sendWhatsAppReport}>
              ↗ Send on WhatsApp
            </button>
          </div>

          <div className="collection-stats">
            {[
              ["Net sales", collections.netSales],
              ["Total collected", collections.totalCollected],
              ["Outstanding", collections.outstanding],
              ["Expenses", collections.expenses],
            ].map(([label, value]) => (
              <div key={label}>
                <span>{label}</span>
                <strong>{money(value)}</strong>
              </div>
            ))}
          </div>

          <div className="payment-breakdown">
            <h3>Payment breakdown</h3>
            {[
              ["Cash", collections.cash],
              ["UPI", collections.upi],
              ["Card", collections.card],
              ["Bank transfer", collections.bankTransfer],
              ["Other", collections.otherPayments],
            ].map(([label, value]) => (
              <div className="payment-row" key={label}>
                <span>{label}</span>
                <strong>{money(value)}</strong>
              </div>
            ))}
          </div>

          <p className="report-note">
            WhatsApp opens with the report prefilled. Review it and press Send.
          </p>
        </section>
      )}

      <footer className="outlet-footer">
        <span>SIVAAH · 925 Sterling Silver</span>
        <span>{today}</span>
      </footer>
    </main>
  );
}
