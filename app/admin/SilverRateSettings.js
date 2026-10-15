"use client";

import { useEffect, useState } from "react";

export default function SilverRateSettings() {
  const [rate, setRate] = useState("");
  const [savedRate, setSavedRate] = useState(null);
  const [updatedAt, setUpdatedAt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function loadRate() {
    try {
      setLoading(true);
      setError("");

      const response = await fetch("/api/admin/silver-rate", {
        cache: "no-store",
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Could not load rate.");
      }

      if (data.rate) {
        setRate(String(data.rate.ratePerGram));
        setSavedRate(data.rate.ratePerGram);
        setUpdatedAt(data.rate.updatedAt);
      }
    } catch (err) {
      setError(err.message || "Could not load silver rate.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadRate();
  }, []);

  async function saveRate(event) {
    event.preventDefault();

    const value = Number(rate);

    if (!Number.isFinite(value) || value <= 0) {
      setError("Please enter a valid rate per gram.");
      return;
    }

    try {
      setSaving(true);
      setError("");
      setMessage("");

      const response = await fetch("/api/admin/silver-rate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ratePerGram: value }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Could not save rate.");
      }

      setSavedRate(data.rate.ratePerGram);
      setUpdatedAt(data.rate.updatedAt);
      setRate(String(data.rate.ratePerGram));
      setMessage("Silver rate saved successfully.");
    } catch (err) {
      setError(err.message || "Could not save silver rate.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">
          Daily Silver Rate
        </h2>
        <p className="mt-1 text-sm text-gray-500">
          Set the rate used by the outlet pricing engine.
        </p>
      </div>

      <div className="max-w-2xl rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        {loading ? (
          <p className="text-sm text-gray-500">Loading silver rate...</p>
        ) : (
          <>
            <div className="mb-6 rounded-xl bg-gray-50 p-4">
              <p className="text-sm text-gray-500">
                Current saved rate
              </p>

              <p className="mt-1 text-3xl font-bold text-gray-900">
                {savedRate != null
                  ? `₹${Number(savedRate).toLocaleString("en-IN")}/g`
                  : "Not set"}
              </p>

              {updatedAt && (
                <p className="mt-2 text-xs text-gray-500">
                  Last updated:{" "}
                  {new Date(updatedAt).toLocaleString("en-IN", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </p>
              )}
            </div>

            <form onSubmit={saveRate} className="space-y-4">
              <div>
                <label
                  htmlFor="silverRate"
                  className="mb-2 block text-sm font-medium text-gray-700"
                >
                  Today's silver rate (₹ per gram)
                </label>

                <input
                  id="silverRate"
                  type="number"
                  min="0.01"
                  max="100000"
                  step="0.01"
                  required
                  value={rate}
                  onChange={(event) => setRate(event.target.value)}
                  placeholder="Enter today's rate"
                  className="w-full rounded-lg border border-gray-300 px-4 py-3 outline-none focus:border-black"
                />
              </div>

              {error && (
                <p className="text-sm text-red-600">{error}</p>
              )}

              {message && (
                <p className="text-sm text-green-700">{message}</p>
              )}

              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-black px-5 py-3 font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save Silver Rate"}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}