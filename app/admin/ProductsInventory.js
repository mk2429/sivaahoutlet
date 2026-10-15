"use client";

import { useCallback, useEffect, useState } from "react";

export default function ProductsInventory() {
  const [products, setProducts] = useState([]);
  const [search, setSearch] = useState("");
  const [quantities, setQuantities] = useState({});
  const [piecesByProduct, setPiecesByProduct] = useState({});
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

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
          batchids: Array.isArray(product.batchids)
            ? product.batchids
            : [],
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

  function changeQuantity(productId, value) {
    setQuantities((previous) => ({
      ...previous,
      [productId]: value,
    }));

    const parsed = Number(value);
    const quantity =
      value === ""
        ? 0
        : Math.min(100, Math.max(0, Number.isFinite(parsed) ? Math.floor(parsed) : 0));

    setPiecesByProduct((previous) => {
      const current = [...(previous[productId] || [])];

      if (quantity > current.length) {
        while (current.length < quantity) {
          current.push({ weight: "", batchId: "" });
        }
      } else {
        current.length = quantity;
      }

      return {
        ...previous,
        [productId]: current,
      };
    });
  }

  function changePiece(productId, index, field, value) {
    setPiecesByProduct((previous) => {
      const current = [...(previous[productId] || [])];

      current[index] = {
        ...current[index],
        [field]: value,
      };

      return {
        ...previous,
        [productId]: current,
      };
    });
  }

  async function addStock(product) {
    const productId = product.erpProductId;
    const quantity = Number(quantities[productId]);
    const enteredPieces = piecesByProduct[productId] || [];

    if (
      !Number.isSafeInteger(quantity) ||
      quantity < 1 ||
      quantity > 100 ||
      enteredPieces.length !== quantity
    ) {
      setError("Quantity aur pieces check karo.");
      return;
    }

    const invalidPiece = enteredPieces.some((piece) => {
      const weight = Number(piece.weight);

      return (
        piece.weight === "" ||
        !Number.isFinite(weight) ||
        weight <= 0 ||
        !piece.batchId ||
        !product.batchids.some(
          (batch) => batch.batchId === piece.batchId
        )
      );
    });

    if (invalidPiece) {
      setError(
        "Har piece ka actual weight aur valid ERP batch select karna zaroori hai."
      );
      return;
    }

    const confirmed = window.confirm(
      `${product.name}\nSKU: ${product.sku}\n\n` +
        enteredPieces
          .map((piece, index) => {
            const batch = product.batchids.find(
              (item) => item.batchId === piece.batchId
            );

            return (
              `Piece ${index + 1}: ${Number(piece.weight)} g\n` +
              `Batch: ${piece.batchId}\n` +
              `Batch date: ${batch?.date || "—"}\n` +
              `Historical silver rate: ₹${batch?.silverRate ?? "—"}/g\n` +
              `Labour rate: ₹${batch?.labourPerGram ?? "—"}/g`
            );
          })
          .join("\n\n") +
        "\n\nConfirm stock receipt?"
    );

    if (!confirmed) return;

    setSavingId(productId);
    setError("");
    setMessage("");

    try {
      const response = await fetch("/api/admin/products/stock", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          erpProductId: productId,
          pieces: enteredPieces.map((piece) => ({
            weight: Number(piece.weight),
            batchId: piece.batchId,
          })),
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Stock add nahi hua.");
      }

      setMessage(
        `${data.product.name}: ${quantity} pieces added successfully. ` +
          `Total available stock: ${data.product.stockQuantity}.`
      );

      setQuantities((previous) => ({
        ...previous,
        [productId]: "",
      }));

      setPiecesByProduct((previous) => ({
        ...previous,
        [productId]: [],
      }));

      await loadProducts();
    } catch (err) {
      setError(err.message || "Stock add nahi hua.");
    } finally {
      setSavingId("");
    }
  }

  const filteredProducts = products.filter((product) => {
    const query = search.trim().toLowerCase();

    return (
      !query ||
      product.name?.toLowerCase().includes(query) ||
      product.sku?.toLowerCase().includes(query) ||
      product.category?.toLowerCase().includes(query) ||
      String(product.grams ?? "").includes(query)
    );
  });

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold">Products & Inventory</h2>
        <p className="mt-1 text-sm text-gray-500">
          ERP catalogue se products select karo. Har physical piece ka
          actual weight aur batch record karo.
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search product name, SKU or category..."
          className="w-full rounded-lg border border-gray-300 px-4 py-3"
        />

        <button
          type="button"
          onClick={loadProducts}
          disabled={loading}
          className="rounded-lg border border-gray-300 px-5 py-3 disabled:opacity-50"
        >
          {loading ? "Loading..." : "Refresh"}
        </button>
      </div>

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

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border p-4">
          <p className="text-sm text-gray-500">ERP Products</p>
          <p className="mt-1 text-2xl font-bold">{products.length}</p>
        </div>

        <div className="rounded-xl border p-4">
          <p className="text-sm text-gray-500">Products in Outlet</p>
          <p className="mt-1 text-2xl font-bold">
            {products.filter((product) => product.alreadyAdded).length}
          </p>
        </div>

        <div className="rounded-xl border p-4">
          <p className="text-sm text-gray-500">Total Available Pieces</p>
          <p className="mt-1 text-2xl font-bold">
            {products.reduce(
              (sum, product) => sum + product.currentStock,
              0
            )}
          </p>
        </div>
      </div>

      {loading ? (
        <p className="py-10 text-center text-gray-500">
          Loading catalogue...
        </p>
      ) : (
        <div className="space-y-4">
          {filteredProducts.map((product) => {
            const productId = product.erpProductId;
            const enteredPieces = piecesByProduct[productId] || [];
            const batches = product.batchids;

            return (
              <div
                key={productId}
                className="space-y-4 rounded-xl border bg-white p-4"
              >
                <div className="flex items-start gap-4">
                  {product.image ? (
                    <img
                      src={product.image}
                      alt={product.name}
                      className="h-20 w-20 rounded-lg border object-contain"
                    />
                  ) : (
                    <div className="flex h-20 w-20 items-center justify-center rounded-lg bg-gray-100 text-xs">
                      No image
                    </div>
                  )}

                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold">{product.name}</h3>

                    <p className="text-xs text-gray-500">
                      SKU: {product.sku}
                    </p>

                    <p className="text-xs text-gray-500">
                      Category: {product.category || "Not provided by ERP"}
                    </p>

                    <p className="mt-1 text-sm font-medium">
                      Reference Weight (ERP):{" "}
                      {product.grams != null
                        ? `${product.grams} g`
                        : "Not provided"}
                    </p>

                    <p className="mt-2 font-medium">
                      Available pieces: {product.currentStock}
                    </p>

                    {product.currentWeights.length > 0 ? (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {product.currentWeights.map((piece, index) => (
                          <span
                            key={piece.pieceId}
                            className="rounded-full bg-gray-100 px-3 py-1 text-sm"
                          >
                            Piece {index + 1}: {piece.weight} g
                            {piece.batchId
                              ? ` · Batch ${piece.batchId}`
                              : " · Legacy stock"}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-2 text-sm text-gray-500">
                        No available pieces in outlet.
                      </p>
                    )}
                  </div>
                </div>

                <div className="border-t pt-4">
                  <h4 className="font-semibold">Add Stock</h4>

                  <p className="mb-3 text-sm text-gray-500">
                    Quantity enter karo. Har piece ka weight aur ERP batch
                    alag select karna hai.
                  </p>

                  {batches.length === 0 && (
                    <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                      ERP mein is product ke liye koi valid batch ID nahi
                      mila. Stock add karne se pehle ERP batch data check
                      karo.
                    </div>
                  )}

                  <label className="mb-1 block text-sm font-medium">
                    Number of pieces
                  </label>

                  <input
                    type="number"
                    min="1"
                    max="100"
                    step="1"
                    value={quantities[productId] ?? ""}
                    onChange={(event) =>
                      changeQuantity(productId, event.target.value)
                    }
                    placeholder="e.g. 3"
                    className="w-full rounded-lg border px-3 py-3 sm:max-w-xs"
                  />

                  {enteredPieces.length > 0 && (
                    <div className="mt-4 space-y-4">
                      {enteredPieces.map((piece, index) => {
                        const selectedBatch = batches.find(
                          (batch) => batch.batchId === piece.batchId
                        );

                        return (
                          <div
                            key={`${productId}-piece-${index}`}
                            className="rounded-lg border p-3"
                          >
                            <h5 className="mb-3 font-medium">
                              Piece {index + 1}
                            </h5>

                            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                              <label className="text-sm font-medium">
                                Actual Weight (grams)
                                <input
                                  type="number"
                                  min="0.001"
                                  step="0.001"
                                  value={piece.weight}
                                  onChange={(event) =>
                                    changePiece(
                                      productId,
                                      index,
                                      "weight",
                                      event.target.value
                                    )
                                  }
                                  placeholder="e.g. 3.250"
                                  className="mt-1 w-full rounded-lg border px-3 py-3"
                                />
                              </label>

                              <label className="text-sm font-medium">
                                ERP Batch ID
                                <select
                                  value={piece.batchId}
                                  onChange={(event) =>
                                    changePiece(
                                      productId,
                                      index,
                                      "batchId",
                                      event.target.value
                                    )
                                  }
                                  disabled={batches.length === 0}
                                  className="mt-1 w-full rounded-lg border bg-white px-3 py-3 disabled:bg-gray-100"
                                >
                                  <option value="">
                                    Select batch ID
                                  </option>

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
                            </div>

                            {selectedBatch && (
                              <div className="mt-3 grid grid-cols-1 gap-2 rounded-lg bg-gray-50 p-3 text-sm sm:grid-cols-3">
                                <div>
                                  <p className="text-gray-500">Batch Date</p>
                                  <p className="font-medium">
                                    {selectedBatch.date}
                                  </p>
                                </div>

                                <div>
                                  <p className="text-gray-500">
                                    Historical Silver Rate
                                  </p>
                                  <p className="font-medium">
                                    ₹{selectedBatch.silverRate}/g
                                  </p>
                                </div>

                                <div>
                                  <p className="text-gray-500">
                                    Labour Rate
                                  </p>
                                  <p className="font-medium">
                                    ₹{selectedBatch.labourPerGram}/g
                                  </p>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => addStock(product)}
                    disabled={
                      savingId === productId ||
                      enteredPieces.length === 0 ||
                      batches.length === 0
                    }
                    className="mt-4 rounded-lg bg-black px-5 py-3 text-sm font-medium text-white disabled:opacity-50"
                  >
                    {savingId === productId
                      ? "Saving..."
                      : "Confirm & Add Stock"}
                  </button>
                </div>
              </div>
            );
          })}

          {filteredProducts.length === 0 && (
            <p className="rounded-xl border p-8 text-center text-gray-500">
              No products found.
            </p>
          )}
        </div>
      )}
    </div>
  );
}