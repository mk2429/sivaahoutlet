"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

// Builds a valid 14-digit batchId (DDMMYYYY + 3-digit silver + 3-digit labour)
// so lib/pricing.js decodeBatchId() works seamlessly for non-ERP products
const buildManualBatchId = (dateStr, silverRate, labourRate) => {
  const d = dateStr ? new Date(dateStr) : new Date();
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = String(d.getFullYear());
  const s = String(
    Math.min(999, Math.max(1, Math.round(Number(silverRate) || 0)))
  ).padStart(3, "0");
  const l = String(
    Math.min(999, Math.max(0, Math.round(Number(labourRate) || 0)))
  ).padStart(3, "0");
  return `${dd}${mm}${yyyy}${s}${l}`;
};

const IGNORED_SKU_WORDS = new Set([
  "925",
  "sterling",
  "silver",
  "pure",
  "hallmarked",
  "with",
  "for",
  "and",
  "the",
  "of",
  "in",
  "a",
  "an",
]);

function previewSku(category, name, existingProducts = []) {
  const catCode = String(category || "")
    .replace(/[^a-zA-Z]/g, "")
    .slice(0, 3)
    .toUpperCase();

  const words = String(name || "")
    .replace(/[^a-zA-Z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w && !IGNORED_SKU_WORDS.has(w.toLowerCase()));

  const initials = words
    .slice(0, 4)
    .map((w) => w[0].toUpperCase())
    .join("");

  if (!catCode || !initials) return "AYO-XXX-XXX-1";

  const base = `AYO-${catCode.padEnd(3, "X")}-${initials}`;
  let maxNum = 0;
  existingProducts.forEach((p) => {
    if (p.sku && p.sku.toUpperCase().startsWith(`${base}-`)) {
      const n = Number(p.sku.split("-").pop());
      if (Number.isFinite(n) && n > maxNum) maxNum = n;
    }
  });

  return `${base}-${maxNum + 1}`;
}

const emptyNewProduct = () => ({
  name: "",
  category: "",
  subtitle: "",
  material: "925 Silver",
  grams: "",
  mrp: "",
  lowStockAlert: "2",
  image: "",
});

const emptyPurchase = () => ({
  purchaseDate: today(),
  supplierName: "",
  supplierPhone: "",
  invoiceNumber: "",
  reference: "",
  gst: "0",
  transport: "0",
  otherCharges: "0",
  notes: "",
});

const emptyPiece = () => ({
  weight: "",
  batchId: "",
  acquisitionSilverRate: "",
  acquisitionLabourPerGram: "",
});

const money = (value) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(Number(value) || 0);

const inputClass =
  "mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm focus:border-black focus:outline-none";

const labelClass = "block text-sm font-medium text-gray-700";

const paymentMethods = ["Cash", "UPI", "Bank Transfer", "Card", "Other"];

const commonCategories = [
  "Pendants",
  "Rings",
  "Earrings",
  "Chains",
  "Kada",
  "Bracelets",
  "Anklets",
  "Necklaces",
  "Bangles",
  "Toe Rings",
  "Coins & Idols",
];

export default function ProductsInventory() {
  const [products, setProducts] = useState([]);
  const [selectedProducts, setSelectedProducts] = useState([]);
  const [productSearch, setProductSearch] = useState("");
  const [productToAdd, setProductToAdd] = useState("");

  const [purchase, setPurchase] = useState(emptyPurchase());
  const [payments, setPayments] = useState([{ method: "Cash", amount: "" }]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  // Popup modal state for non-website products
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newProductForm, setNewProductForm] = useState(emptyNewProduct());
  const [creatingProduct, setCreatingProduct] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [modalError, setModalError] = useState("");

  const loadProducts = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/admin/products/catalogue", {
        cache: "no-store",
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Products load nahi hue.");
      }

      setProducts(
        (data.products || []).map((product) => ({
          ...product,
          batchids: Array.isArray(product.batchids) ? product.batchids : [],
          currentWeights: Array.isArray(product.currentWeights)
            ? product.currentWeights
            : [],
        }))
      );
    } catch (err) {
      setError(err.message || "Products load nahi hue.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  const generatedSkuPreview = useMemo(
    () => previewSku(newProductForm.category, newProductForm.name, products),
    [newProductForm.category, newProductForm.name, products]
  );

async function handleImageUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingImage(true);
    setModalError("");

    try {
      // 1. Get short-lived signed parameters from our Next.js backend
      const sigRes = await fetch("/api/admin/upload", {
        method: "POST",
      });
      const sigData = await sigRes.json();

      if (!sigRes.ok || !sigData.success) {
        throw new Error(sigData.message || "Could not get upload signature.");
      }

      // 2. Upload directly from the browser to Cloudinary
      const formData = new FormData();
      formData.append("file", file);
      formData.append("api_key", sigData.apiKey);
      formData.append("timestamp", String(sigData.timestamp));
      formData.append("folder", sigData.folder);
      formData.append("signature", sigData.signature);

      const uploadRes = await fetch(
        `https://api.cloudinary.com/v1_1/${sigData.cloudName}/image/upload`,
        {
          method: "POST",
          body: formData,
        }
      );

      const uploadData = await uploadRes.json();

      if (!uploadRes.ok || !uploadData.secure_url) {
        throw new Error(
          uploadData.error?.message || "Cloudinary image upload failed."
        );
      }

      setNewProductForm((prev) => ({ ...prev, image: uploadData.secure_url }));
    } catch (err) {
      setModalError(
        err.message ||
          "Image upload failed. You can also paste an image URL below."
      );
    } finally {
      setUploadingImage(false);
    }
  }

  async function handleCreateProduct(e) {
    e.preventDefault();
    if (creatingProduct || uploadingImage) return;

    setModalError("");

    if (!newProductForm.name.trim()) {
      setModalError("Product name is required.");
      return;
    }
    if (!newProductForm.category.trim()) {
      setModalError("Category is required.");
      return;
    }

    setCreatingProduct(true);

    try {
      const response = await fetch("/api/admin/products/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...newProductForm,
          grams: Number(newProductForm.grams) || 0,
          mrp: Number(newProductForm.mrp) || 0,
          lowStockAlert: Number(newProductForm.lowStockAlert) || 2,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Could not create product.");
      }

      const created = {
        ...data.product,
        batchids: Array.isArray(data.product.batchids)
          ? data.product.batchids
          : [],
        currentWeights: [],
      };

      setProducts((prev) => [created, ...prev]);
      setSelectedProducts((prev) => [
        ...prev,
        {
          product: created,
          pieces: [emptyPiece()],
        },
      ]);

      setMessage(
        `Product "${created.name}" created (SKU: ${created.sku}) and added below.`
      );
      setNewProductForm(emptyNewProduct());
      setShowCreateModal(false);
    } catch (err) {
      setModalError(err.message || "Failed to create product.");
    } finally {
      setCreatingProduct(false);
    }
  }

  const filteredProducts = useMemo(() => {
    const query = productSearch.trim().toLowerCase();

    return products.filter((product) => {
      const alreadySelected = selectedProducts.some(
        (item) =>
          String(item.product.erpProductId) === String(product.erpProductId)
      );

      const searchableText = [
        product.name,
        product.sku,
        product.category,
        product.erpProductId,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return !alreadySelected && searchableText.includes(query);
    });
  }, [products, productSearch, selectedProducts]);

  const totalPieces = selectedProducts.reduce(
    (sum, group) => sum + group.pieces.length,
    0
  );

  const preview = useMemo(() => {
    let weight = 0;
    let silver = 0;
    let labour = 0;

    selectedProducts.forEach((group) => {
      group.pieces.forEach((piece) => {
        const pieceWeight = Number(piece.weight) || 0;

        weight += pieceWeight;
        silver += pieceWeight * (Number(piece.acquisitionSilverRate) || 0);
        labour += pieceWeight * (Number(piece.acquisitionLabourPerGram) || 0);
      });
    });

    const gst = Number(purchase.gst) || 0;
    const transport = Number(purchase.transport) || 0;
    const other = Number(purchase.otherCharges) || 0;

    const total = silver + labour + gst + transport + other;

    const paid = payments.reduce(
      (sum, payment) => sum + (Number(payment.amount) || 0),
      0
    );

    return {
      weight,
      silver,
      labour,
      gst,
      transport,
      other,
      total,
      paid,
      outstanding: total - paid,
    };
  }, [selectedProducts, purchase, payments]);

  function addProduct(productId) {
    const product = products.find(
      (item) => String(item.erpProductId) === String(productId)
    );

    if (!product) {
      setError("Product not found. Please refresh the catalogue.");
      return;
    }

    const alreadyAdded = selectedProducts.some(
      (item) =>
        String(item.product.erpProductId) === String(product.erpProductId)
    );

    if (alreadyAdded) {
      setError("This product is already added. Use Add Piece instead.");
      return;
    }

    setSelectedProducts((previous) => [
      ...previous,
      {
        product,
        pieces: [emptyPiece()],
      },
    ]);

    setError("");
    setMessage("");
  }

  function removeProduct(productId) {
    setSelectedProducts((previous) =>
      previous.filter((group) => group.product.erpProductId !== productId)
    );
  }

  function addPiece(productId) {
    setSelectedProducts((previous) =>
      previous.map((group) =>
        group.product.erpProductId === productId
          ? {
              ...group,
              pieces: [...group.pieces, emptyPiece()],
            }
          : group
      )
    );
  }

  function removePiece(productId, index) {
    setSelectedProducts((previous) =>
      previous.map((group) => {
        if (group.product.erpProductId !== productId) {
          return group;
        }

        return {
          ...group,
          pieces: group.pieces.filter((_, pieceIndex) => pieceIndex !== index),
        };
      })
    );
  }

  function updatePiece(productId, index, field, value) {
    setSelectedProducts((previous) =>
      previous.map((group) => {
        if (group.product.erpProductId !== productId) {
          return group;
        }

        const pieces = [...group.pieces];
        const piece = { ...pieces[index] };
        const isCustomNonErp =
          group.product.sku?.startsWith("AYO-") ||
          group.product.batchids.length === 0;

        if (field === "batchId") {
          const batch = group.product.batchids.find(
            (item) => item.batchId === value
          );

          piece.batchId = value;
          piece.acquisitionSilverRate = batch
            ? String(batch.silverRate ?? "")
            : "";
          piece.acquisitionLabourPerGram = batch
            ? String(batch.labourPerGram ?? "")
            : "";
        } else {
          piece[field] = value;

          if (
            isCustomNonErp &&
            (field === "acquisitionSilverRate" ||
              field === "acquisitionLabourPerGram")
          ) {
            const sRate =
              field === "acquisitionSilverRate"
                ? value
                : piece.acquisitionSilverRate;
            const lRate =
              field === "acquisitionLabourPerGram"
                ? value
                : piece.acquisitionLabourPerGram;

            if (sRate !== "" && lRate !== "") {
              piece.batchId = buildManualBatchId(
                purchase.purchaseDate,
                sRate,
                lRate
              );
            }
          }
        }

        pieces[index] = piece;

        return { ...group, pieces };
      })
    );
  }

  function updatePurchase(field, value) {
    setPurchase((previous) => ({
      ...previous,
      [field]: value,
    }));
  }

  function updatePayment(index, field, value) {
    setPayments((previous) => {
      const updated = [...previous];

      updated[index] = {
        ...updated[index],
        [field]: value,
      };

      return updated;
    });
  }

  function addPayment() {
    setPayments((previous) => [...previous, { method: "UPI", amount: "" }]);
  }

  function removePayment(index) {
    setPayments((previous) =>
      previous.filter((_, paymentIndex) => paymentIndex !== index)
    );
  }

  function validatePurchase() {
    if (!selectedProducts.length) {
      return "Please add at least one product.";
    }

    if (!purchase.supplierName.trim()) {
      return "Supplier name is required.";
    }

    if (!purchase.purchaseDate) {
      return "Please select purchase date.";
    }

    for (const group of selectedProducts) {
      const product = group.product;
      const isCustomNonErp =
        product.sku?.startsWith("AYO-") || product.batchids.length === 0;

      if (!group.pieces.length) {
        return `Add at least one piece for ${product.name}.`;
      }

      if (!product.erpProductId) {
        return `ERP Product ID missing for ${product.name}.`;
      }

      for (let index = 0; index < group.pieces.length; index++) {
        const piece = group.pieces[index];

        const weight = Number(piece.weight);
        const silver = Number(piece.acquisitionSilverRate);
        const labour = Number(piece.acquisitionLabourPerGram);

        if (piece.weight === "" || !Number.isFinite(weight) || weight <= 0) {
          return `Enter a valid weight for ${product.name}, Piece ${index + 1}.`;
        }

        if (!isCustomNonErp) {
          if (
            !piece.batchId ||
            !product.batchids.some((batch) => batch.batchId === piece.batchId)
          ) {
            return `Select a valid batch for ${product.name}, Piece ${index + 1}.`;
          }
        } else if (!piece.batchId || !/^\d{14}$/.test(piece.batchId)) {
          return `Enter valid silver & labour rates to generate batch for ${product.name}, Piece ${index + 1}.`;
        }

        if (
          piece.acquisitionSilverRate === "" ||
          !Number.isFinite(silver) ||
          silver < 0
        ) {
          return `Enter a valid silver rate for ${product.name}, Piece ${index + 1}.`;
        }

        if (
          piece.acquisitionLabourPerGram === "" ||
          !Number.isFinite(labour) ||
          labour < 0
        ) {
          return `Enter a valid labour rate for ${product.name}, Piece ${index + 1}.`;
        }
      }
    }

    const additionalCosts = [
      purchase.gst,
      purchase.transport,
      purchase.otherCharges,
    ];

    if (
      additionalCosts.some(
        (value) => !Number.isFinite(Number(value)) || Number(value) < 0
      )
    ) {
      return "Please check GST, transport and other charges.";
    }

    const invalidPayment = payments.some((payment) => {
      const amount = Number(payment.amount || 0);

      return (
        !paymentMethods.includes(payment.method) ||
        !Number.isFinite(amount) ||
        amount < 0
      );
    });

    if (invalidPayment) {
      return "Please check payment details.";
    }

    if (preview.paid - preview.total > 0.001) {
      return "Total payment cannot be greater than purchase cost.";
    }

    return "";
  }

  async function submitPurchase() {
    if (saving) return;

    setError("");
    setMessage("");

    const validationError = validatePurchase();

    if (validationError) {
      setError(validationError);
      return;
    }

    const productSummary = selectedProducts
      .map((group) => `${group.product.name} — ${group.pieces.length} pieces`)
      .join("\n");

    const confirmation = window.confirm(
      `CONFIRM PURCHASE\n\n` +
        `${productSummary}\n\n` +
        `Total Products: ${selectedProducts.length}\n` +
        `Total Pieces: ${totalPieces}\n` +
        `Total Weight: ${preview.weight.toFixed(3)} g\n\n` +
        `Silver Cost: ${money(preview.silver)}\n` +
        `Labour Cost: ${money(preview.labour)}\n` +
        `GST: ${money(preview.gst)}\n` +
        `Transport: ${money(preview.transport)}\n` +
        `Other Charges: ${money(preview.other)}\n\n` +
        `TOTAL PURCHASE: ${money(preview.total)}\n` +
        `Amount Paid: ${money(preview.paid)}\n` +
        `Outstanding: ${money(preview.outstanding)}\n\n` +
        `Supplier: ${purchase.supplierName}\n` +
        `Invoice: ${purchase.invoiceNumber || "Not provided"}\n\n` +
        `Confirm purchase and add all stock?`
    );

    if (!confirmation) return;

    setSaving(true);

    try {
      const payload = {
        products: selectedProducts.map((group) => ({
          erpProductId: group.product.erpProductId,
          pieces: group.pieces.map((piece) => ({
            weight: Number(piece.weight),
            batchId: piece.batchId,
            acquisitionSilverRate: Number(piece.acquisitionSilverRate),
            acquisitionLabourPerGram: Number(piece.acquisitionLabourPerGram),
          })),
        })),

        purchase: {
          ...purchase,
          supplierName: purchase.supplierName.trim(),
          gst: Number(purchase.gst) || 0,
          transport: Number(purchase.transport) || 0,
          otherCharges: Number(purchase.otherCharges) || 0,
          payments: payments.map((payment) => ({
            method: payment.method,
            amount: Number(payment.amount) || 0,
          })),
        },
      };

      const response = await fetch("/api/admin/products/stock", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Purchase save nahi hui.");
      }

      const summary = data.purchaseSummary || {};

      setMessage(
        `Purchase ${data.purchaseNumber} saved successfully. ` +
          `${summary.totalProducts ?? selectedProducts.length} products, ` +
          `${summary.totalPieces ?? totalPieces} pieces added. ` +
          `Total: ${money(summary.totalCost)}. ` +
          `Paid: ${money(summary.amountPaid)}. ` +
          `Outstanding: ${money(summary.outstanding)}.`
      );

      setSelectedProducts([]);
      setPurchase(emptyPurchase());
      setPayments([{ method: "Cash", amount: "" }]);
      setProductSearch("");
      setProductToAdd("");

      await loadProducts();
    } catch (err) {
      setError(err.message || "Purchase save nahi hui.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold">Products & Inventory</h2>
          <p className="mt-1 text-sm text-gray-500">
            Create one purchase with multiple products and multiple pieces.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setModalError("");
            setNewProductForm(emptyNewProduct());
            setShowCreateModal(true);
          }}
          className="rounded-lg bg-black px-4 py-2.5 text-sm font-semibold text-white hover:bg-gray-800"
        >
          + Add Custom Product (Non-Website)
        </button>
      </div>

      {/* ALERTS */}
      {message && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">
          {message}
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* INVENTORY OVERVIEW */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border bg-white p-4">
          <p className="text-sm text-gray-500">ERP / Catalogue Products</p>
          <p className="mt-1 text-2xl font-bold">{products.length}</p>
        </div>

        <div className="rounded-xl border bg-white p-4">
          <p className="text-sm text-gray-500">Products in Outlet</p>
          <p className="mt-1 text-2xl font-bold">
            {products.filter((p) => p.alreadyAdded).length}
          </p>
        </div>

        <div className="rounded-xl border bg-white p-4">
          <p className="text-sm text-gray-500">Available Pieces</p>
          <p className="mt-1 text-2xl font-bold">
            {products.reduce(
              (sum, product) => sum + (Number(product.currentStock) || 0),
              0
            )}
          </p>
        </div>
      </div>

      {/* PRODUCT SELECTOR */}
      <div className="rounded-xl border bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-lg font-semibold">Add Products</h3>
          <button
            type="button"
            onClick={() => {
              setModalError("");
              setNewProductForm(emptyNewProduct());
              setShowCreateModal(true);
            }}
            className="rounded-lg border border-black px-3 py-1.5 text-xs font-semibold text-black hover:bg-gray-50"
          >
            + New Non-Website Product
          </button>
        </div>

        <input
          value={productSearch}
          onChange={(e) => setProductSearch(e.target.value)}
          placeholder="Search by product name, SKU or category..."
          className={inputClass}
        />

        <div className="mt-4 space-y-2">
          {loading ? (
            <p className="py-4 text-center text-sm text-gray-500">
              Loading products...
            </p>
          ) : filteredProducts.length === 0 ? (
            <p className="py-4 text-center text-sm text-gray-500">
              {products.length === 0
                ? "No products received from catalogue API."
                : "No matching products found."}
            </p>
          ) : (
            filteredProducts.slice(0, 30).map((product) => (
              <div
                key={product.erpProductId}
                className="flex items-center gap-3 rounded-lg border p-3"
              >
                {product.image ? (
                  <img
                    src={product.image}
                    alt={product.name}
                    className="h-14 w-14 rounded-lg border object-contain"
                  />
                ) : (
                  <div className="h-14 w-14 rounded-lg bg-gray-100" />
                )}

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium">{product.name}</p>
                    {product.sku?.startsWith("AYO-") && (
                      <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
                        Custom
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500">SKU: {product.sku}</p>
                  <p className="text-xs text-gray-500">
                    {product.sku?.startsWith("AYO-")
                      ? "Manual batch (auto-generated from rates)"
                      : `${product.batchids?.length || 0} valid batches`}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => addProduct(product.erpProductId)}
                  disabled={saving}
                  className="rounded-lg bg-black px-3 py-2 text-sm text-white disabled:opacity-50"
                >
                  + Add
                </button>
              </div>
            ))
          )}
        </div>

        <div className="mt-3 flex items-center justify-between">
          <p className="text-xs text-gray-500">
            Showing up to 30 matching products.
          </p>

          <button
            type="button"
            onClick={loadProducts}
            disabled={loading || saving}
            className="rounded-lg border px-3 py-2 text-sm"
          >
            Refresh Catalogue
          </button>
        </div>
      </div>

      {/* SELECTED PRODUCTS */}
      {selectedProducts.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold">Products in This Purchase</h3>
            <span className="rounded-full bg-gray-100 px-3 py-1 text-sm font-medium">
              {selectedProducts.length} products · {totalPieces} pieces
            </span>
          </div>

          {selectedProducts.map((group) => {
            const product = group.product;
            const productId = product.erpProductId;
            const batches = product.batchids || [];
            const isCustomNonErp =
              product.sku?.startsWith("AYO-") || batches.length === 0;

            return (
              <div
                key={productId}
                className="space-y-4 rounded-xl border bg-white p-4"
              >
                {/* PRODUCT HEADER */}
                <div className="flex flex-wrap items-start gap-3">
                  {product.image ? (
                    <img
                      src={product.image}
                      alt={product.name}
                      className="h-20 w-20 rounded-lg border object-contain"
                    />
                  ) : (
                    <div className="flex h-20 w-20 items-center justify-center rounded-lg bg-gray-100 text-xs text-gray-500">
                      No image
                    </div>
                  )}

                  <div className="min-w-0 flex-1">
                    <h4 className="font-semibold">{product.name}</h4>
                    <p className="text-xs text-gray-500">SKU: {product.sku}</p>
                    <p className="text-xs text-gray-500">
                      Category: {product.category || "Not provided"}
                    </p>
                    <p className="mt-1 text-sm">
                      ERP Reference Weight: {product.grams ?? "—"} g
                    </p>
                    <p className="text-sm font-medium">
                      Existing Stock: {product.currentStock ?? 0} pieces
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => removeProduct(productId)}
                    disabled={saving}
                    className="rounded-lg border border-red-200 px-3 py-2 text-sm text-red-600"
                  >
                    Remove Product
                  </button>
                </div>

                {/* EXISTING STOCK WEIGHTS */}
                {product.currentWeights?.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {product.currentWeights.map((piece, index) => (
                      <span
                        key={piece.pieceId || index}
                        className="rounded-full bg-gray-100 px-3 py-1 text-xs"
                      >
                        Existing Piece {index + 1}: {piece.weight} g
                      </span>
                    ))}
                  </div>
                )}

                {/* PIECES */}
                <div className="border-t pt-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h5 className="font-semibold">
                        Pieces to Add ({group.pieces.length})
                      </h5>
                      <p className="text-xs text-gray-500">
                        {isCustomNonErp
                          ? "Enter weight, silver rate, and labour rate (Batch ID auto-generates)."
                          : "Enter weight and select the ERP batch for each piece."}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => addPiece(productId)}
                      disabled={saving || group.pieces.length >= 500}
                      className="rounded-lg border px-3 py-2 text-sm font-medium"
                    >
                      + Add Piece
                    </button>
                  </div>

                  <div className="mt-3 space-y-3">
                    {group.pieces.map((piece, index) => {
                      const selectedBatch = batches.find(
                        (batch) => batch.batchId === piece.batchId
                      );

                      return (
                        <div
                          key={`${productId}-${index}`}
                          className="rounded-lg border bg-gray-50 p-3"
                        >
                          <div className="mb-3 flex items-center justify-between">
                            <h6 className="font-medium">Piece {index + 1}</h6>

                            {group.pieces.length > 1 && (
                              <button
                                type="button"
                                onClick={() => removePiece(productId, index)}
                                disabled={saving}
                                className="text-xs text-red-600"
                              >
                                Remove Piece
                              </button>
                            )}
                          </div>

                          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <label className={labelClass}>
                              Actual Weight (grams)
                              <input
                                type="number"
                                min="0.001"
                                step="0.001"
                                value={piece.weight}
                                onChange={(e) =>
                                  updatePiece(
                                    productId,
                                    index,
                                    "weight",
                                    e.target.value
                                  )
                                }
                                placeholder="e.g. 3.250"
                                className={inputClass}
                              />
                            </label>

                            {isCustomNonErp ? (
                              <label className={labelClass}>
                                Auto Batch ID (14-digit)
                                <input
                                  type="text"
                                  readOnly
                                  value={
                                    piece.batchId || "Enter rates below..."
                                  }
                                  className={`${inputClass} bg-gray-100 text-gray-600`}
                                />
                              </label>
                            ) : (
                              <label className={labelClass}>
                                ERP Batch ID
                                <select
                                  value={piece.batchId}
                                  onChange={(e) =>
                                    updatePiece(
                                      productId,
                                      index,
                                      "batchId",
                                      e.target.value
                                    )
                                  }
                                  className={inputClass}
                                >
                                  <option value="">Select batch</option>
                                  {batches.map((batch) => (
                                    <option
                                      key={batch.batchId}
                                      value={batch.batchId}
                                    >
                                      {batch.batchId} · {batch.date}
                                    </option>
                                  ))}
                                </select>
                              </label>
                            )}

                            <label className={labelClass}>
                              Acquisition Silver Rate (₹/g)
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={piece.acquisitionSilverRate}
                                onChange={(e) =>
                                  updatePiece(
                                    productId,
                                    index,
                                    "acquisitionSilverRate",
                                    e.target.value
                                  )
                                }
                                placeholder="e.g. 150"
                                className={inputClass}
                              />
                            </label>

                            <label className={labelClass}>
                              Acquisition Labour Rate (₹/g)
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={piece.acquisitionLabourPerGram}
                                onChange={(e) =>
                                  updatePiece(
                                    productId,
                                    index,
                                    "acquisitionLabourPerGram",
                                    e.target.value
                                  )
                                }
                                placeholder="e.g. 100"
                                className={inputClass}
                              />
                            </label>
                          </div>

                          {selectedBatch && (
                            <p className="mt-2 text-xs text-gray-500">
                              Batch date: {selectedBatch.date} · Historical
                              silver rate: ₹{selectedBatch.silverRate}/g
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* SHARED SUPPLIER DETAILS */}
      {selectedProducts.length > 0 && (
        <>
          <div className="rounded-xl border bg-white p-4">
            <h3 className="text-lg font-bold">Supplier & Invoice Details</h3>
            <p className="mt-1 text-xs text-gray-500">
              These details apply to the entire purchase.
            </p>

            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className={labelClass}>
                Supplier Name *
                <input
                  value={purchase.supplierName}
                  onChange={(e) =>
                    updatePurchase("supplierName", e.target.value)
                  }
                  placeholder="Supplier name"
                  className={inputClass}
                />
              </label>

              <label className={labelClass}>
                Supplier Phone
                <input
                  value={purchase.supplierPhone}
                  onChange={(e) =>
                    updatePurchase("supplierPhone", e.target.value)
                  }
                  placeholder="Mobile number"
                  className={inputClass}
                />
              </label>

              <label className={labelClass}>
                Purchase Date *
                <input
                  type="date"
                  value={purchase.purchaseDate}
                  onChange={(e) =>
                    updatePurchase("purchaseDate", e.target.value)
                  }
                  className={inputClass}
                />
              </label>

              <label className={labelClass}>
                Invoice Number
                <input
                  value={purchase.invoiceNumber}
                  onChange={(e) =>
                    updatePurchase("invoiceNumber", e.target.value)
                  }
                  placeholder="Invoice / bill number"
                  className={inputClass}
                />
              </label>

              <label className={`${labelClass} sm:col-span-2`}>
                Reference
                <input
                  value={purchase.reference}
                  onChange={(e) => updatePurchase("reference", e.target.value)}
                  placeholder="Optional reference"
                  className={inputClass}
                />
              </label>
            </div>
          </div>

          {/* SHARED ADDITIONAL COSTS */}
          <div className="rounded-xl border bg-white p-4">
            <h3 className="text-lg font-bold">Additional Purchase Costs</h3>
            <p className="mt-1 text-xs text-gray-500">
              Enter the actual total amounts in rupees. These costs will be
              allocated across all pieces in this purchase.
            </p>

            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
              {[
                ["gst", "GST"],
                ["transport", "Transport"],
                ["otherCharges", "Other Charges"],
              ].map(([field, title]) => (
                <label key={field} className={labelClass}>
                  {title} (₹)
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={purchase[field]}
                    onChange={(e) => updatePurchase(field, e.target.value)}
                    className={inputClass}
                  />
                </label>
              ))}
            </div>

            <label className={`${labelClass} mt-3`}>
              Purchase Notes
              <textarea
                rows={3}
                value={purchase.notes}
                onChange={(e) => updatePurchase("notes", e.target.value)}
                placeholder="Optional purchase notes"
                className={inputClass}
              />
            </label>
          </div>

          {/* SHARED PAYMENTS */}
          <div className="rounded-xl border bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-lg font-bold">Payment Details</h3>
                <p className="mt-1 text-xs text-gray-500">
                  Record payments made against this purchase.
                </p>
              </div>

              <button
                type="button"
                onClick={addPayment}
                disabled={saving}
                className="rounded-lg border px-3 py-2 text-sm"
              >
                + Add Payment
              </button>
            </div>

            <div className="mt-4 space-y-3">
              {payments.map((payment, index) => (
                <div
                  key={index}
                  className="grid grid-cols-1 items-end gap-2 sm:grid-cols-[1fr_1fr_auto]"
                >
                  <label className={labelClass}>
                    Payment Method
                    <select
                      value={payment.method}
                      onChange={(e) =>
                        updatePayment(index, "method", e.target.value)
                      }
                      className={inputClass}
                    >
                      {paymentMethods.map((method) => (
                        <option key={method} value={method}>
                          {method}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className={labelClass}>
                    Amount (₹)
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={payment.amount}
                      onChange={(e) =>
                        updatePayment(index, "amount", e.target.value)
                      }
                      placeholder="0.00"
                      className={inputClass}
                    />
                  </label>

                  <button
                    type="button"
                    onClick={() => removePayment(index)}
                    disabled={saving}
                    className="rounded-lg border border-red-200 px-3 py-2.5 text-sm text-red-600"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>

            <p className="mt-3 text-xs text-gray-500">
              Cash goes to Cash. UPI and bank transfer are recorded against
              their respective accounts.
            </p>
          </div>

          {/* PURCHASE SUMMARY */}
          <div className="rounded-xl border bg-gray-50 p-4">
            <h3 className="text-lg font-bold">Complete Purchase Summary</h3>

            <div className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span>Total Products</span>
                <strong>{selectedProducts.length}</strong>
              </div>

              <div className="flex justify-between">
                <span>Total Pieces</span>
                <strong>{totalPieces}</strong>
              </div>

              <div className="flex justify-between">
                <span>Total Weight</span>
                <strong>{preview.weight.toFixed(3)} g</strong>
              </div>

              <div className="flex justify-between">
                <span>Silver Cost</span>
                <strong>{money(preview.silver)}</strong>
              </div>

              <div className="flex justify-between">
                <span>Labour Cost</span>
                <strong>{money(preview.labour)}</strong>
              </div>

              <div className="flex justify-between">
                <span>GST</span>
                <strong>{money(preview.gst)}</strong>
              </div>

              <div className="flex justify-between">
                <span>Transport</span>
                <strong>{money(preview.transport)}</strong>
              </div>

              <div className="flex justify-between">
                <span>Other Charges</span>
                <strong>{money(preview.other)}</strong>
              </div>

              <div className="flex justify-between border-t pt-3 text-base">
                <strong>Total Purchase Cost</strong>
                <strong>{money(preview.total)}</strong>
              </div>

              <div className="flex justify-between">
                <span>Amount Paid</span>
                <strong>{money(preview.paid)}</strong>
              </div>

              <div className="flex justify-between text-amber-700">
                <span>Supplier Outstanding</span>
                <strong>{money(preview.outstanding)}</strong>
              </div>
            </div>
          </div>

          {/* SUBMIT */}
          <button
            type="button"
            onClick={submitPurchase}
            disabled={
              saving ||
              loading ||
              selectedProducts.length === 0 ||
              totalPieces === 0
            }
            className="w-full rounded-lg bg-black px-5 py-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving
              ? "Saving Complete Purchase..."
              : `Confirm Purchase & Add ${selectedProducts.length} Products (${totalPieces} Pieces)`}
          </button>
        </>
      )}

      {selectedProducts.length === 0 && !loading && (
        <div className="rounded-xl border border-dashed p-8 text-center">
          <p className="font-semibold">
            No products added to this purchase yet.
          </p>
          <p className="mt-1 text-sm text-gray-500">
            Search and add your first product above, or create a non-website
            product.
          </p>
        </div>
      )}

      {/* POPUP MODAL: CREATE NON-WEBSITE PRODUCT */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-lg font-bold">
                  Add New Product (Non-Website)
                </h3>
                <p className="text-xs text-gray-500">
                  Creates product in MongoDB and adds it to your purchase list
                  to enter piece weights.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="rounded-lg px-2 py-1 text-sm text-gray-500 hover:bg-gray-100"
              >
                ✕
              </button>
            </div>

            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              Generated SKU ID:{" "}
              <strong className="font-mono">{generatedSkuPreview}</strong>
            </div>

            {modalError && (
              <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-700">
                {modalError}
              </div>
            )}

            <form onSubmit={handleCreateProduct} className="mt-4 space-y-3">
              <label className={labelClass}>
                Product Name *
                <input
                  required
                  value={newProductForm.name}
                  onChange={(e) =>
                    setNewProductForm((p) => ({ ...p, name: e.target.value }))
                  }
                  placeholder="e.g. 925 Sterling Silver Marquise Floral Cluster Pendant"
                  className={inputClass}
                />
              </label>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className={labelClass}>
                  Category *
                  <input
                    required
                    list="jewellery-categories"
                    value={newProductForm.category}
                    onChange={(e) =>
                      setNewProductForm((p) => ({
                        ...p,
                        category: e.target.value,
                      }))
                    }
                    placeholder="e.g. Pendants"
                    className={inputClass}
                  />
                  <datalist id="jewellery-categories">
                    {commonCategories.map((cat) => (
                      <option key={cat} value={cat} />
                    ))}
                  </datalist>
                </label>

                <label className={labelClass}>
                  Material
                  <input
                    value={newProductForm.material}
                    onChange={(e) =>
                      setNewProductForm((p) => ({
                        ...p,
                        material: e.target.value,
                      }))
                    }
                    placeholder="925 Silver"
                    className={inputClass}
                  />
                </label>
              </div>

              <label className={labelClass}>
                Subtitle / Short Description
                <input
                  value={newProductForm.subtitle}
                  onChange={(e) =>
                    setNewProductForm((p) => ({
                      ...p,
                      subtitle: e.target.value,
                    }))
                  }
                  placeholder="Optional design details"
                  className={inputClass}
                />
              </label>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <label className={labelClass}>
                  Ref. Weight (g)
                  <input
                    type="number"
                    min="0"
                    step="0.001"
                    value={newProductForm.grams}
                    onChange={(e) =>
                      setNewProductForm((p) => ({
                        ...p,
                        grams: e.target.value,
                      }))
                    }
                    placeholder="5.5"
                    className={inputClass}
                  />
                </label>

                <label className={labelClass}>
                  MRP (₹)
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={newProductForm.mrp}
                    onChange={(e) =>
                      setNewProductForm((p) => ({ ...p, mrp: e.target.value }))
                    }
                    placeholder="5999"
                    className={inputClass}
                  />
                </label>

                <label className={labelClass}>
                  Low Stock Alert
                  <input
                    type="number"
                    min="0"
                    value={newProductForm.lowStockAlert}
                    onChange={(e) =>
                      setNewProductForm((p) => ({
                        ...p,
                        lowStockAlert: e.target.value,
                      }))
                    }
                    className={inputClass}
                  />
                </label>
              </div>

              <div className="space-y-2">
                <label className={labelClass}>
                  Product Image
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    disabled={uploadingImage}
                    className="mt-1 block w-full text-xs text-gray-600 file:mr-3 file:rounded-lg file:border-0 file:bg-gray-100 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-black hover:file:bg-gray-200"
                  />
                </label>

                {uploadingImage && (
                  <p className="text-xs text-blue-600">Uploading image...</p>
                )}

                <input
                  type="url"
                  value={newProductForm.image}
                  onChange={(e) =>
                    setNewProductForm((p) => ({ ...p, image: e.target.value }))
                  }
                  placeholder="Or paste Cloudinary / image URL directly..."
                  className={inputClass}
                />

                {newProductForm.image && (
                  <img
                    src={newProductForm.image}
                    alt="Preview"
                    className="h-20 w-20 rounded-lg border object-contain"
                  />
                )}
              </div>

              <div className="mt-5 flex items-center justify-end gap-2 border-t pt-4">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  disabled={creatingProduct}
                  className="rounded-lg border px-4 py-2 text-sm"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={creatingProduct || uploadingImage}
                  className="rounded-lg bg-black px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {creatingProduct ? "Adding Product..." : "Add Product"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}