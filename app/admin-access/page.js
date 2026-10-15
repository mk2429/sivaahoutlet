
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AdminAccessPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      const response = await fetch("/api/admin-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        setError(data.message || "Incorrect password.");
        return;
      }

      router.replace("/admin");
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="admin-access-page">
      <form className="admin-access-card" onSubmit={handleSubmit}>
        <p className="admin-access-brand">SIVAAH</p>
        <h1>Admin Access</h1>
        <p className="admin-access-description">
          Enter your password to continue.
        </p>

        <label htmlFor="admin-password">Password</label>
        <input
          id="admin-password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Enter admin password"
          autoComplete="current-password"
          required
          autoFocus
        />

        {error && <p className="admin-access-error">{error}</p>}

        <button type="submit" disabled={loading}>
          {loading ? "Verifying..." : "Continue"}
        </button>
      </form>
    </main>
  );
}
