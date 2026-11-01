"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import "./sale.css";
import Link from "next/link";
const money = (value) =>
    new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
        maximumFractionDigits: 0,
        minimumFractionDigits: 0,
    }).format(Math.round(Number(value) || 0));

const PAYMENT_METHODS = ["Cash", "UPI", "Card", "Bank Transfer", "Other"];

function getDiscountStatus(discount, context) {
    const { currentTime, gross, totalWeight, selectedPieces } = context;

    if (!selectedPieces.length) {
        return {
            eligible: false,
            reason: "Select jewellery first",
        };
    }

    if (
        discount.startDate &&
        new Date(discount.startDate).getTime() > currentTime
    ) {
        return {
            eligible: false,
            reason: `Starts ${new Date(discount.startDate).toLocaleDateString(
                "en-IN"
            )}`,
        };
    }

    if (
        discount.endDate &&
        new Date(discount.endDate).getTime() < currentTime
    ) {
        return {
            eligible: false,
            reason: "Offer expired",
        };
    }

    if (gross < Number(discount.minBillAmount || 0)) {
        return {
            eligible: false,
            reason: `Minimum bill ${money(discount.minBillAmount)} required`,
        };
    }

    if (totalWeight < Number(discount.minWeightGrams || 0)) {
        return {
            eligible: false,
            reason: `Minimum weight ${Number(discount.minWeightGrams)} g required`,
        };
    }

    if (discount.applicability === "category") {
        const matches = selectedPieces.some((piece) =>
            (discount.categories || []).includes(piece.category)
        );

        if (!matches) {
            return {
                eligible: false,
                reason: `Only for: ${(discount.categories || []).join(", ")}`,
            };
        }
    }

    if (discount.applicability === "sku") {
        const matches = selectedPieces.some((piece) =>
            (discount.skus || []).includes(piece.sku)
        );

        if (!matches) {
            return {
                eligible: false,
                reason: `Only for SKU: ${(discount.skus || []).join(", ")}`,
            };
        }
    }

    return {
        eligible: true,
        reason: "Eligible",
    };
}

export default function SaleDashboard() {
    const [data, setData] = useState({
        customers: [],
        pieces: [],
        discounts: [],
    });

    const [salespersons, setSalespersons] = useState([]);

    const [customerId, setCustomerId] = useState("");
    const [customerSearch, setCustomerSearch] = useState("");
    const [customerPickerOpen, setCustomerPickerOpen] = useState(false);
    const [addCustomerOpen, setAddCustomerOpen] = useState(false);
    const [customerSaving, setCustomerSaving] = useState(false);
    const [customerFormError, setCustomerFormError] = useState("");
    const [newCustomer, setNewCustomer] = useState({
        name: "",
        whatsappNumber: "",
        gender: "",
        address: "",
        dateOfBirth: "",
        anniversaryDate: "",
    });
    const [search, setSearch] = useState("");
    const [selected, setSelected] = useState([]);

    const [discountId, setDiscountId] = useState("");
    const [salespersonName, setSalespersonName] = useState("");

    const [splitPayment, setSplitPayment] = useState(false);
    const [singlePaymentMethod, setSinglePaymentMethod] = useState("Cash");
    const [singlePaymentAmount, setSinglePaymentAmount] = useState("0");

    const [payments, setPayments] = useState([
        { method: "Cash", amount: "0" },
        { method: "UPI", amount: "0" },
    ]);

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const [currentTime, setCurrentTime] = useState(0);

    const loadOptions = useCallback(async () => {
        setLoading(true);
        setError("");

        try {
            const [optionsResponse, salespersonsResponse] = await Promise.all([
                fetch("/api/outlet/sale-options", {
                    cache: "no-store",
                }),
                fetch("/api/outlet/salespersons", {
                    cache: "no-store",
                }),
            ]);

            const optionsResult = await optionsResponse.json();

            if (!optionsResponse.ok) {
                throw new Error(
                    optionsResult.error || "Could not load sale options."
                );
            }

            setData({
                customers: optionsResult.customers || [],
                pieces: optionsResult.pieces || [],
                discounts: optionsResult.discounts || [],
            });

            if (salespersonsResponse.ok) {
                const salespersonResult = await salespersonsResponse.json();

                const people = Array.isArray(salespersonResult)
                    ? salespersonResult
                    : salespersonResult.salespersons || [];

                const uniquePeople = people
                    .filter((person) => person && person.name)
                    .map((person) => ({
                        name: String(person.name).trim(),
                    }))
                    .filter((person) => person.name)
                    .filter(
                        (person, index, all) =>
                            all.findIndex((p) => p.name === person.name) === index
                    )
                    .sort((a, b) => a.name.localeCompare(b.name));

                setSalespersons(uniquePeople);
            } else {
                setSalespersons([]);
            }
        } catch (err) {
            setError(err.message || "Could not load sale options.");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadOptions();
        setCurrentTime(Date.now());
    }, [loadOptions]);

    const filteredCustomers = useMemo(() => {
        const q = customerSearch.trim().toLowerCase();

        if (!q) {
            return data.customers.slice(0, 30);
        }

        return data.customers
            .filter((customer) =>
                [
                    customer.name,
                    customer.whatsappNumber,
                    customer.mobile,
                    customer.phone,
                ].some((value) => String(value || "").toLowerCase().includes(q))
            )
            .slice(0, 30);
    }, [data.customers, customerSearch]);

    const selectedCustomer = data.customers.find(
        (customer) => customer._id === customerId
    );

    const filteredPieces = useMemo(() => {
        const q = search.trim().toLowerCase();

        const pieces = !q
            ? data.pieces
            : data.pieces.filter((piece) =>
                [piece.name, piece.sku, piece.category, piece.batchId].some(
                    (value) => String(value || "").toLowerCase().includes(q)
                )
            );

        return pieces.slice(0, q ? 150 : 100);
    }, [data.pieces, search]);

    const selectedPieces = useMemo(
        () =>
            selected
                .map((id) =>
                    data.pieces.find(
                        (piece) => `${piece.productId}:${piece.pieceId}` === id
                    )
                )
                .filter(Boolean),
        [selected, data.pieces]
    );

    const gross = selectedPieces.reduce(
        (sum, piece) => sum + Number(piece.listPrice || 0),
        0
    );

    const totalWeight = selectedPieces.reduce(
        (sum, piece) => sum + Number(piece.weight || 0),
        0
    );

    const discountOptions = useMemo(() => {
        if (!currentTime) return [];

        return data.discounts.map((discount) => ({
            ...discount,
            eligibility: getDiscountStatus(discount, {
                currentTime,
                gross,
                totalWeight,
                selectedPieces,
            }),
        }));
    }, [currentTime, data.discounts, gross, totalWeight, selectedPieces]);

    const eligibleDiscounts = useMemo(
        () => discountOptions.filter((discount) => discount.eligibility.eligible),
        [discountOptions]
    );

    useEffect(() => {
        if (
            discountId &&
            !eligibleDiscounts.some((discount) => discount._id === discountId)
        ) {
            setDiscountId("");
        }
    }, [discountId, eligibleDiscounts]);

    const selectedDiscount = eligibleDiscounts.find(
        (discount) => discount._id === discountId
    );

    const discountTotal = selectedDiscount
        ? selectedPieces.reduce((sum, piece) => {
            let eligible = true;

            if (selectedDiscount.applicability === "category") {
                eligible = (selectedDiscount.categories || []).includes(
                    piece.category
                );
            } else if (selectedDiscount.applicability === "sku") {
                eligible = (selectedDiscount.skus || []).includes(piece.sku);
            }

            if (!eligible) return sum;

            const raw =
                selectedDiscount.type === "percentage"
                    ? (Number(piece.listPrice || 0) *
                        Number(selectedDiscount.value || 0)) /
                    100
                    : Number(selectedDiscount.value || 0);

            // Maximum discount: 15% per eligible piece.
            return (
                sum +
                Math.min(raw, Number(piece.listPrice || 0) * 0.15)
            );
        }, 0)
        : 0;

    // Payable is rounded to whole rupees.
    const net = Math.max(0, Math.round(gross - discountTotal));

    const amountPaid = splitPayment
        ? payments.reduce(
            (sum, payment) =>
                sum + Math.max(0, Math.round(Number(payment.amount || 0))),
            0
        )
        : Math.max(0, Math.round(Number(singlePaymentAmount || 0)));

    const balance = Math.max(0, net - amountPaid);

    // Prefill the full bill amount for a normal single-method payment.
    useEffect(() => {
        if (!splitPayment) {
            setSinglePaymentAmount(String(net));
        }
    }, [net, splitPayment]);

    function togglePiece(piece) {
        const id = `${piece.productId}:${piece.pieceId}`;

        setSelected((previous) =>
            previous.includes(id)
                ? previous.filter((value) => value !== id)
                : [...previous, id]
        );
    }

    function enterSplitPayment() {
        setPayments([
            { method: singlePaymentMethod, amount: String(net) },
            { method: "UPI", amount: "0" },
        ]);
        setSplitPayment(true);
    }

    function cancelSplitPayment() {
        setSplitPayment(false);
        setPayments([
            { method: singlePaymentMethod, amount: String(net) },
            { method: "UPI", amount: "0" },
        ]);
    }

    function updatePayment(index, key, value) {
        setPayments((previous) =>
            previous.map((payment, i) =>
                i === index ? { ...payment, [key]: value } : payment
            )
        );
    }

    function addPaymentRow() {
        setPayments((previous) => [
            ...previous,
            { method: "UPI", amount: "0" },
        ]);
    }

    function removePaymentRow(index) {
        setPayments((previous) =>
            previous.length <= 2
                ? previous
                : previous.filter((_, i) => i !== index)
        );
    }
    async function handleAddCustomer() {
        setCustomerFormError("");

        const name = newCustomer.name.trim();
        const whatsappNumber = newCustomer.whatsappNumber.replace(/\D/g, "");

        if (!name) {
            setCustomerFormError("Please enter customer name.");
            return;
        }

        if (whatsappNumber.length !== 10) {
            setCustomerFormError("Enter a valid 10-digit mobile number.");
            return;
        }

        if (!newCustomer.gender) {
            setCustomerFormError("Please select gender.");
            return;
        }

        setCustomerSaving(true);

        try {
            const response = await fetch("/api/outlet/customers", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    ...newCustomer,
                    name,
                    whatsappNumber,
                }),
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(
                    result.message || result.error || "Could not add customer."
                );
            }

            if (!result.customer?._id) {
                throw new Error("Customer saved, but customer details were not returned.");
            }

            const customer = result.customer;

            // Add the new customer to the existing customer list.
            setData((previous) => ({
                ...previous,
                customers: [
                    customer,
                    ...previous.customers.filter(
                        (item) => item._id !== customer._id
                    ),
                ],
            }));

            // Automatically select the newly created customer.
            setCustomerId(customer._id);
            setCustomerSearch("");
            setCustomerPickerOpen(false);

            setNewCustomer({
                name: "",
                whatsappNumber: "",
                gender: "",
                address: "",
                dateOfBirth: "",
                anniversaryDate: "",
            });

            setAddCustomerOpen(false);
        } catch (err) {
            setCustomerFormError(err.message || "Could not add customer.");
        } finally {
            setCustomerSaving(false);
        }
    }
    async function completeSale(event) {
        event.preventDefault();
        setError("");
        if (!customerId || !selectedCustomer) {
            window.alert("Please select a customer before creating the bill.");
            return;
        }
        if (!salespersonName.trim()) {
            window.alert("Please select a salesperson.");
            return;
        }
        if (!selectedPieces.length) {
            setError("Select at least one jewellery piece.");
            return;
        }

        if (!Number.isFinite(amountPaid) || amountPaid < 0) {
            setError("Enter a valid payment amount.");
            return;
        }

        if (amountPaid > net) {
            setError("Total payment cannot exceed the bill total.");
            return;
        }

        if (splitPayment && payments.length < 2) {
            setError("Add at least two payment methods for split payment.");
            return;
        }

        if (
            splitPayment &&
            payments.some(
                (payment) =>
                    !Number.isFinite(Number(payment.amount || 0)) ||
                    Number(payment.amount || 0) < 0
            )
        ) {
            setError("Enter valid payment amounts.");
            return;
        }

        const paymentSummary = splitPayment
            ? payments
                .map((payment) => ({
                    method: payment.method,
                    amount: Math.max(0, Math.round(Number(payment.amount || 0))),
                }))
                .filter((payment) => payment.amount > 0)
            : amountPaid > 0
                ? [
                    {
                        method: singlePaymentMethod,
                        amount: amountPaid,
                    },
                ]
                : [];

        const distinctMethods = [
            ...new Set(paymentSummary.map((payment) => payment.method)),
        ];

        const paymentMethod =
            distinctMethods.length > 1
                ? "Split"
                : distinctMethods[0] || singlePaymentMethod || "Cash";

        setSaving(true);

        try {
            const response = await fetch("/api/outlet/sales", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    customerId: customerId || null,
                    items: selectedPieces.map((piece) => ({
                        productId: piece.productId,
                        pieceId: piece.pieceId,
                    })),
                    discountId: discountId || null,
                    paymentMethod,
                    amountPaid,
                    paymentSummary,
                    salespersonName,
                }),
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || "Could not save the sale.");
            }

            if (!result.sale?._id) {
                throw new Error(
                    "Sale saved, but the invoice ID was not returned."
                );
            }

            window.location.href = `/sale/invoice/${encodeURIComponent(
                result.sale._id
            )}`;
        } catch (err) {
            setError(err.message || "Could not save the sale.");
            setSaving(false);
        }
    }

    if (loading) {
        return (
            <main className="sale-shell">
                <p>Loading Sale Dashboard…</p>
            </main>
        );
    }

    return (
        <main className="sale-shell">
            <header className="sale-topbar">
                <div>
                    <div className="sale-eyebrow">SIVAAH OUTLET</div>
                    <h1>New Sale</h1>
                    <p>
                        Select the customer, exact jewellery pieces and payment.
                    </p>
                </div>

                <Link href="/" className="sale-home-button">
                    ← Home
                </Link>
            </header>

            {error && <div className="sale-alert">{error}</div>}

            <form className="sale-layout" onSubmit={completeSale}>
                {/* CUSTOMER AND INVENTORY */}
                <section className="sale-panel">
                    <div className="sale-section-heading">
                        <span>01</span>
                        <h2>Customer</h2>
                    </div>

                    <label className="sale-label" htmlFor="customer-search">
                        Search customer by name or mobile
                    </label>
<div className="sale-customer-row">
                    <div className="sale-customer-picker">
                        <input
                            id="customer-search"
                            value={
                                customerPickerOpen
                                    ? customerSearch
                                    : selectedCustomer
                                        ? `${selectedCustomer.name}${selectedCustomer.whatsappNumber
                                            ? ` — ${selectedCustomer.whatsappNumber}`
                                            : ""
                                        }`
                                        : customerSearch
                            }
                            onChange={(event) => {
                                setCustomerSearch(event.target.value);
                                setCustomerId("");
                                setCustomerPickerOpen(true);
                            }}
                            onFocus={() => setCustomerPickerOpen(true)}
                            placeholder="Type customer name or mobile number…"
                            autoComplete="off"
                        />

                        {customerId && (
                            <button
                                className="sale-clear-customer"
                                type="button"
                                onClick={() => {
                                    setCustomerId("");
                                    setCustomerSearch("");
                                    setCustomerPickerOpen(true);
                                }}
                            >
                                Change
                            </button>
                        )}

                        {customerPickerOpen && (
                            <div className="sale-customer-results">


                                {filteredCustomers.map((customer) => (
                                    <button
                                        type="button"
                                        className="sale-customer-option"
                                        key={customer._id}
                                        onClick={() => {
                                            setCustomerId(customer._id);
                                            setCustomerSearch("");
                                            setCustomerPickerOpen(false);
                                        }}
                                    >
                                        <strong>{customer.name || "Unnamed customer"}</strong>
                                        <small>
                                            {customer.whatsappNumber ||
                                                customer.mobile ||
                                                customer.phone ||
                                                "No mobile number"}
                                        </small>
                                    </button>
                                ))}

                                {filteredCustomers.length === 0 && (
                                    <p className="sale-empty sale-customer-no-results">
                                        No customers match that name or number.
                                    </p>
                                )}
                            </div>
                        )}
                    </div>
                        <button
        type="button"
        className="sale-add-customer"
        onClick={() => {
            setCustomerFormError("");
            setNewCustomer({
                name: "",
                whatsappNumber: "",
                gender: "",
                address: "",
                dateOfBirth: "",
                anniversaryDate: "",
            });
            setAddCustomerOpen(true);
        }}
    >
        <span>＋</span> Add
    </button>
</div>
                    <div className="sale-section-heading sale-inventory-heading">
                        <span>02</span>
                        <h2>Available Jewellery</h2>
                        <small>{data.pieces.length} pieces</small>
                    </div>

                    <input
                        className="sale-search"
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder="Search product, SKU, category or batch…"
                    />

                    <div className="sale-piece-list">
                        {filteredPieces.map((piece) => {
                            const id = `${piece.productId}:${piece.pieceId}`;
                            const isSelected = selected.includes(id);

                            return (
                                <article
                                    className={`sale-piece-card ${isSelected ? "is-selected" : ""
                                        }`}
                                    key={id}
                                >
                                    <div className="sale-piece-photo-wrap">
                                        {piece.image ? (
                                            <img
                                                className="sale-piece-photo"
                                                src={piece.image}
                                                alt={piece.name || "Jewellery product"}
                                            />
                                        ) : (
                                            <div className="sale-piece-photo sale-piece-photo-placeholder">
                                                <span>925</span>
                                                <small>SIVAAH</small>
                                            </div>
                                        )}
                                    </div>

                                    <div className="sale-piece-details">
                                        <strong>{piece.name}</strong>
                                        <small>Batch: {piece.batchId || "N/A"}</small>
                                        <small>SKU: {piece.sku || "N/A"}</small>
                                    </div>

                                    <div className="sale-piece-action">
                                        <strong style={{ color: "green" }}>
                                            {money(piece.listPrice)}
                                        </strong>

                                        <small style={{ color: "red" }}>
                                            {Number(piece.weight || 0).toFixed(3)} g
                                        </small>

                                        <button
                                            type="button"
                                            className={`sale-add-button ${isSelected ? "is-added" : ""
                                                }`}
                                            onClick={() => togglePiece(piece)}
                                            aria-label={
                                                isSelected
                                                    ? `Remove ${piece.name} from bill`
                                                    : `Add ${piece.name} to bill`
                                            }
                                        >
                                            {isSelected ? "✓ Added" : "+ Add"}
                                        </button>
                                    </div>
                                </article>
                            );
                        })}

                        {filteredPieces.length === 0 && (
                            <p className="sale-empty">No available pieces found.</p>
                        )}
                    </div>
                </section>

                {/* BILL SUMMARY AND PAYMENT */}
                <aside className="sale-panel sale-summary-panel">
                    <div className="sale-section-heading">
                        <span>03</span>
                        <h2>Bill Summary</h2>
                    </div>

                    <div className="sale-selected-list">
                        {selectedPieces.length === 0 ? (
                            <p className="sale-empty">No items selected yet.</p>
                        ) : (
                            selectedPieces.map((piece) => (
                                <div
                                    className="sale-selected-item"
                                    key={`${piece.productId}:${piece.pieceId}`}
                                >
                                    <div>
                                        <strong>{piece.name}</strong>
                                        <small>
                                            SKU: {piece.sku || "N/A"} ·{" "}
                                            <b>{Number(piece.weight || 0).toFixed(3)} g</b>
                                        </small>
                                    </div>

                                    <div className="sale-selected-price">
                                        <strong>{money(piece.listPrice)}</strong>
                                        <button
                                            type="button"
                                            onClick={() => togglePiece(piece)}
                                        >
                                            Remove
                                        </button>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>

                    <label className="sale-label" htmlFor="discount">
                        Discounts
                    </label>

                    <select
                        id="discount"
                        value={discountId}
                        onChange={(event) => setDiscountId(event.target.value)}
                        className="sale-discount-select"
                    >
                        <option value="">No discount</option>

                        {discountOptions.map((discount) => (
                            <option
                                key={discount._id}
                                value={discount._id}
                                disabled={!discount.eligibility.eligible}
                                className={
                                    discount.eligibility.eligible
                                        ? "discount-eligible"
                                        : "discount-ineligible"
                                }
                            >
                                {discount.name} (
                                {discount.type === "percentage"
                                    ? `${discount.value}%`
                                    : money(discount.value)}
                                ) — {discount.eligibility.reason}
                            </option>
                        ))}
                    </select>

                    <p className="sale-help">
                        Ineligible discounts are shown but cannot be selected. Eligibility
                        is checked again by the server. The discount is capped at 15% per
                        eligible item.
                    </p>

                    <div className="sale-totals">
                        <div>
                            <span>Pieces</span>
                            <strong>{selectedPieces.length}</strong>
                        </div>

                        <div>
                            <span>Total weight</span>
                            <strong>{totalWeight.toFixed(3)} g</strong>
                        </div>

                        <div>
                            <span>Subtotal</span>
                            <strong>{money(gross)}</strong>
                        </div>

                        <div>
                            <span>Discount</span>
                            <strong>− {money(discountTotal)}</strong>
                        </div>

                        <div className="sale-grand-total">
                            <span>Payable</span>
                            <strong>{money(net)}</strong>
                        </div>
                    </div>

                    <div className="sale-section-heading sale-payment-heading">
                        <span>04</span>
                        <h2>Payment</h2>
                    </div>

                    <label className="sale-label" htmlFor="salesperson">
                        Salesperson
                    </label>

                    <select
                        id="salesperson"
                        value={salespersonName}
                        onChange={(event) => setSalespersonName(event.target.value)}
                    >
                        <option value="">Select salesperson</option>
                        {salespersons.map((person) => (
                            <option key={person.name} value={person.name}>
                                {person.name}
                            </option>
                        ))}
                    </select>

                    {salespersons.length === 0 && (
                        <p className="sale-help">
                            No salesperson names were returned. Check that
                            /api/outlet/salespersons is available.
                        </p>
                    )}

                    {!splitPayment ? (
                        <div className="sale-single-payment">
                            <label className="sale-label" htmlFor="payment-method">
                                Payment method
                            </label>

                            <select
                                id="payment-method"
                                value={singlePaymentMethod}
                                onChange={(event) =>
                                    setSinglePaymentMethod(event.target.value)
                                }
                            >
                                {PAYMENT_METHODS.map((method) => (
                                    <option key={method} value={method}>
                                        {method}
                                    </option>
                                ))}
                            </select>

                            <label className="sale-label" htmlFor="single-payment-amount">
                                Amount received (₹)
                            </label>

                            <input
                                id="single-payment-amount"
                                type="number"
                                min="0"
                                max={net}
                                step="1"
                                inputMode="numeric"
                                value={singlePaymentAmount}
                                readOnly
                                aria-label="Full payable amount"
                                className="sale-amount-readonly"
                            />

                            <button
                                type="button"
                                className="sale-add-payment"
                                onClick={enterSplitPayment}
                            >
                                + Split Payment
                            </button>
                        </div>
                    ) : (
                        <>
                            <div className="sale-payment-rows-heading">
                                <label className="sale-label">Split payment breakdown</label>

                                <button
                                    type="button"
                                    className="sale-add-payment"
                                    onClick={addPaymentRow}
                                >
                                    + Add payment
                                </button>
                            </div>

                            <div className="sale-payment-rows">
                                {payments.map((payment, index) => (
                                    <div className="sale-payment-row" key={index}>
                                        <select
                                            aria-label={`Payment method ${index + 1}`}
                                            value={payment.method}
                                            onChange={(event) =>
                                                updatePayment(index, "method", event.target.value)
                                            }
                                        >
                                            {PAYMENT_METHODS.map((method) => (
                                                <option key={method} value={method}>
                                                    {method}
                                                </option>
                                            ))}
                                        </select>

                                        <input
                                            aria-label={`Payment amount ${index + 1}`}
                                            type="number"
                                            min="0"
                                            max={net}
                                            step="1"
                                            inputMode="numeric"
                                            value={payment.amount}
                                            onChange={(event) =>
                                                updatePayment(index, "amount", event.target.value)
                                            }
                                            placeholder="Amount ₹"
                                        />

                                        {payments.length > 2 && (
                                            <button
                                                type="button"
                                                className="sale-remove-payment"
                                                onClick={() => removePaymentRow(index)}
                                                aria-label={`Remove payment row ${index + 1}`}
                                            >
                                                ×
                                            </button>
                                        )}
                                    </div>
                                ))}
                            </div>

                            <button
                                type="button"
                                className="sale-add-payment"
                                onClick={cancelSplitPayment}
                            >
                                Cancel split payment
                            </button>
                        </>
                    )}

                    <div className="sale-payment-totals">
                        <div>
                            <span>Total received</span>
                            <strong>{money(amountPaid)}</strong>
                        </div>

                        <div
                            className={
                                balance > 0 ? "sale-balance-due" : "sale-balance-clear"
                            }
                        >
                            <span>{balance > 0 ? "Balance due" : "Balance"}</span>
                            <strong>{money(balance)}</strong>
                        </div>
                    </div>

                    <p className="sale-help">
                        {splitPayment
                            ? "Enter the amount received through each method. Any remaining balance can remain unpaid."
                            : "The full payable amount is prefilled. Change the amount received if the customer is making a partial payment."}
                    </p>

                    <button
                        className="sale-submit"
                        type="submit"
                        disabled={saving || selectedPieces.length === 0}
                    >
                        {saving ? "Recording Sale…" : "Complete Sale & Open Invoice"}
                    </button>

                    <p className="sale-help">
                        Once saved, the invoice will open automatically.
                    </p>
                </aside>
            </form>
            {addCustomerOpen && (
    <div
        className="sale-customer-modal-overlay"
        onMouseDown={(event) => {
            if (event.target === event.currentTarget && !customerSaving) {
                setAddCustomerOpen(false);
            }
        }}
    >
        <section className="sale-customer-modal">
            <div className="sale-customer-modal-header">
                <div>
                    <span>NEW CUSTOMER</span>
                    <h2>Add Customer</h2>
                    <p>Register a customer without leaving this bill.</p>
                </div>

                <button
                    type="button"
                    onClick={() => setAddCustomerOpen(false)}
                    disabled={customerSaving}
                >
                    ×
                </button>
            </div>

            {customerFormError && (
                <div className="sale-customer-modal-error">
                    {customerFormError}
                </div>
            )}

            <div className="sale-customer-modal-fields">
                <label>
                    Customer Name *
                    <input
                        autoFocus
                        value={newCustomer.name}
                        maxLength={100}
                        placeholder="Enter full name"
                        onChange={(e) =>
                            setNewCustomer({
                                ...newCustomer,
                                name: e.target.value,
                            })
                        }
                    />
                </label>

                <label>
                    WhatsApp / Mobile Number *
                    <input
                        type="tel"
                        inputMode="numeric"
                        maxLength={10}
                        value={newCustomer.whatsappNumber}
                        placeholder="10-digit mobile number"
                        onChange={(e) =>
                            setNewCustomer({
                                ...newCustomer,
                                whatsappNumber: e.target.value.replace(/\D/g, "").slice(0, 10),
                            })
                        }
                    />
                </label>

                <label>
                    Gender *
                    <select
                        value={newCustomer.gender}
                        onChange={(e) =>
                            setNewCustomer({
                                ...newCustomer,
                                gender: e.target.value,
                            })
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

                <label>
                    Address
                    <textarea
                        rows={2}
                        value={newCustomer.address}
                        placeholder="House, street, town, PIN code"
                        onChange={(e) =>
                            setNewCustomer({
                                ...newCustomer,
                                address: e.target.value,
                            })
                        }
                    />
                </label>

                <label>
                    Date of Birth
                    <input
                        type="date"
                        value={newCustomer.dateOfBirth}
                        onChange={(e) =>
                            setNewCustomer({
                                ...newCustomer,
                                dateOfBirth: e.target.value,
                            })
                        }
                    />
                </label>

                <label>
                    Anniversary Date
                    <input
                        type="date"
                        value={newCustomer.anniversaryDate}
                        onChange={(e) =>
                            setNewCustomer({
                                ...newCustomer,
                                anniversaryDate: e.target.value,
                            })
                        }
                    />
                </label>
            </div>

            <div className="sale-customer-modal-actions">
                <button
                    type="button"
                    className="sale-customer-cancel"
                    disabled={customerSaving}
                    onClick={() => setAddCustomerOpen(false)}
                >
                    Cancel
                </button>

                <button
                    type="button"
                    className="sale-customer-save"
                    disabled={customerSaving}
                    onClick={handleAddCustomer}
                >
                    {customerSaving ? "Saving..." : "Save & Select Customer"}
                </button>
            </div>
        </section>
    </div>
)}
        </main>
    );
}