
"use client";

import { useState, useEffect } from "react";
import ProductsInventory from "./ProductsInventory";
import SilverRateSettings from "./SilverRateSettings";
import PricingInventory from "./PricingInventory";
import Reports from "./Reports";
// import SalesBills from "./sales-bills/SalesBills";
import SalesBills from "./SalesBill";
import Discounts from "./Discount";
import Expenses from "./Expenses";
const sections = [
    ["Sales & Bills", "All invoices, salesperson-wise sales and returns."],
    ["Salespersons", "Add names, mobile numbers and addresses; view their bills."],
    ["Products & Inventory", "Catalogue, stock receipts and stock movements."],
    ["Pricing Inventory", "View piece-wise costs, selling prices and margins."],
    ["Silver Rate", "Set today's silver rate per gram for product pricing."],
    ["Discounts", "Create and manage percentage and flat discounts."],
    ["Expenses", "Record and review outlet expenses."],
    ["Reports", "Sales, margins and stock valuation."],
    

];

export default function AdminDashboard() {
    const [activePage, setActivePage] = useState("Dashboard");
    const [silverRate, setSilverRate] = useState(null);
const [dashboardStats, setDashboardStats] = useState(null);
const [dashboardLoading, setDashboardLoading] = useState(true);

useEffect(() => {
  let cancelled = false;

  async function loadDashboardStats() {
    try {
      const response = await fetch("/api/admin/dashboard", {
        cache: "no-store",
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.message || "Failed to load dashboard");
      }

      if (!cancelled) setDashboardStats(result.metrics);
    } catch (error) {
      console.error("Failed to load dashboard stats:", error);
    } finally {
      if (!cancelled) setDashboardLoading(false);
    }
  }

  loadDashboardStats();

  return () => {
    cancelled = true;
  };
}, []);
    useEffect(() => {
        async function loadSilverRate() {
            try {
                const response = await fetch("/api/admin/silver-rate", {
                    cache: "no-store",
                });

                const data = await response.json();

                if (response.ok && data.success && data.rate) {
                    setSilverRate(data.rate.ratePerGram);
                }
            } catch (error) {
                console.error("Failed to load silver rate:", error);
            }
        }

        loadSilverRate();
    }, []);
    return (
        <main className="app-shell">
            <aside className="sidebar">
                <div className="brand">
                    <div className="brand-mark">S</div>
                    <div>
                        <h1>SIVAAH</h1>
                        <p>ADMIN CONTROL</p>
                    </div>
                </div>

                <div className="outlet-card">
                    <div className="outlet-icon">⌂</div>
                    <div>
                        <p className="muted-label">CURRENT OUTLET</p>
                        <strong>Main Outlet</strong>
                        <span className="outlet-status">
                            <span className="status-dot" /> Active
                        </span>
                    </div>
                </div>

                <nav className="navigation">
                    <p className="nav-section">ADMINISTRATION</p>

                    <button
                        className={`nav-item ${activePage === "Dashboard" ? "nav-item-active" : ""
                            }`}
                        onClick={() => setActivePage("Dashboard")}
                    >
                        <span className="nav-icon">▦</span>
                        Dashboard
                    </button>

                    {sections.map(([name]) => (
                        <button
                            key={name}
                            className={`nav-item ${activePage === name ? "nav-item-active" : ""
                                }`}
                            onClick={() => setActivePage(name)}
                        >
                            <span className="nav-icon">◇</span>
                            {name}
                        </button>
                    ))}
                </nav>

                <div className="sidebar-footer">
                    <div className="user-avatar">A</div>
                    <div className="user-details">
                        <strong>Administrator</strong>
                        <span>Admin access</span>
                    </div>
                </div>
            </aside>

            <section className="main-area">
                <header className="topbar">
                    <div className="breadcrumb">
                        <span>Shri Narayan Jewellers</span>
                        <span className="breadcrumb-separator">/</span>
                        <strong>{activePage}</strong>
                    </div>

                    <form action="/api/admin-access/logout" method="POST">
                        <button type="submit" className="secondary-button">
                            Logout
                        </button>
                    </form>
                </header>

                <div className="page-content">
                    {activePage === "Dashboard" ? (
                        <>
                            <div className="page-heading">
                                <div>
                                    <div className="eyebrow">ADMIN CONTROL</div>
                                    <h2>Business Overview</h2>
                                    <p className="page-description">
                                        Monitor and manage your complete outlet.
                                    </p>
                                </div>
                            </div>

                            <div className="dashboard-notice">
                                <span className="notice-icon">i</span>
                                <div>
                                    <strong>Dashboard preview</strong>
                                    <p>
                                        Figures will be populated after the database and
                                        transaction modules are connected.
                                    </p>
                                </div>
                            </div>

                           
<div className="stats-grid">
  <article className="stat-card">
    <span className="stat-label">TODAY'S SALES</span>
    <h3>
      {dashboardStats
        ? `₹${Number(dashboardStats.todaySales).toLocaleString("en-IN")}`
        : dashboardLoading ? "Loading..." : "—"}
    </h3>
    <p>Completed bills · Today</p>
  </article>

  <article className="stat-card">
    <span className="stat-label">CASH & UPI RECEIVED</span>
    <h3>
      {dashboardStats
        ? `₹${Number(dashboardStats.totalReceived).toLocaleString("en-IN")}`
        : dashboardLoading ? "Loading..." : "—"}
    </h3>
    <p>
      Cash: ₹{Number(dashboardStats?.cashReceived || 0).toLocaleString("en-IN")}
      {" · "}
      UPI: ₹{Number(dashboardStats?.upiReceived || 0).toLocaleString("en-IN")}
    </p>
  </article>

  <article className="stat-card">
    <span className="stat-label">PIECES AT OUTLET</span>
    <h3>
      {dashboardStats
        ? Number(dashboardStats.outletPieces).toLocaleString("en-IN")
        : dashboardLoading ? "Loading..." : "—"}
    </h3>
    <p>Currently in stock</p>
  </article>

  <article className="stat-card">
    <span className="stat-label">TODAY'S PROFIT · INSTANT CP</span>
    <h3 style={{
      color: dashboardStats?.instantProfit < 0 ? "#dc2626" : undefined
    }}>
      {dashboardStats
        ? `₹${Number(dashboardStats.instantProfit).toLocaleString("en-IN", {
            maximumFractionDigits: 2
          })}`
        : dashboardLoading ? "Loading..." : "—"}
    </h3>
    <p>
      {dashboardStats
        ? `${dashboardStats.soldPiecesCount} pieces sold`
        : "Today's sold pieces"}
      {dashboardStats?.itemsWithUnknownCost > 0
        ? ` · ${dashboardStats.itemsWithUnknownCost} cost unknown`
        : ""}
    </p>
  </article>
</div>

                            <div
                                className="stat-card"
                                style={{
                                    marginTop: "20px",
                                    marginBottom: "24px",
                                    borderLeft: "4px solid #b08d57",
                                }}
                            >
                                <span className="stat-label">TODAY'S SILVER RATE</span>

                                <h3 style={{ fontSize: "28px", marginTop: "8px" }}>
                                    {silverRate !== null
                                        ? `₹${Number(silverRate).toLocaleString("en-IN")}/g`
                                        : "Rate not set"}
                                </h3>

                                <p>Current saved rate per gram</p>

                                <button
                                    className="secondary-button"
                                    style={{ marginTop: "12px" }}
                                    onClick={() => setActivePage("Silver Rate")}
                                >
                                    Update Silver Rate →
                                </button>
                            </div>
                            <div className="section-heading">
                                <div>
                                    <h3>Manage Outlet</h3>
                                    <p>Open an administrative module.</p>
                                </div>
                            </div>

                            <div className="operations-grid">
                                {sections.map(([name, description]) => (
                                    <button
                                        className="operation-card"
                                        key={name}
                                        onClick={() => setActivePage(name)}
                                    >
                                        <span className="operation-icon">◇</span>
                                        <span className="operation-title">{name}</span>
                                        <span className="operation-description">
                                            {description}
                                        </span>
                                        <span className="operation-action">Open →</span>
                                    </button>
                                ))}
                            </div>
                        </>
                    ) : activePage === "Products & Inventory" ? (
                        <ProductsInventory />
                    ) : activePage === "Silver Rate" ? (
                        <SilverRateSettings />
                    ) : activePage === "Pricing Inventory" ? (
                        <PricingInventory />
                    ) : activePage === "Discounts" ? (
                        <Discounts />
                    ) :
                        activePage === "Sales & Bills" ? (
                            <SalesBills />
                        ) : 
                        activePage === "Reports" ?( <Reports />

                        ): 
                        activePage === "Expenses" ?( <Expenses />

                        )
                        :(
                            <section className="module-page">
                                <div className="eyebrow">ADMINISTRATION</div>
                                <h2>{activePage}</h2>
                                <p className="page-description">
                                    {sections.find(([name]) => name === activePage)?.[1]}
                                </p>

                                <div className="module-card">
                                    <h3>{activePage}</h3>
                                    <p>
                                        This module is a placeholder and is not yet connected
                                        to the database.
                                    </p>

                                    {activePage === "Salespersons" && (
                                        <button
                                            className="primary-button"
                                            onClick={() => {
                                                window.location.href = "/admin/salespersons";
                                            }}
                                        >
                                            Manage Salespersons →
                                        </button>
                                    )}

                                    <button
                                        className="secondary-button"
                                        style={{ marginTop: 12 }}
                                        onClick={() => setActivePage("Dashboard")}
                                    >
                                        ← Back to Dashboard
                                    </button>
                                </div>
                            </section>
                        )}
                </div>
            </section>
        </main>
    );
}
