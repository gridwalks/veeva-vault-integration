// src/components/StatusBar.jsx
import { useEffect, useState } from "react";

export default function StatusBar() {
  const [status, setStatus] = useState({ ok: null, loading: true });

  async function load() {
    try {
      const res = await fetch("/api/readiness");
      const json = await res.json();
      setStatus({ ok: res.ok && json.ok, loading: false, data: json });
    } catch (e) {
      setStatus({ ok: false, loading: false, error: e.message });
    }
  }

  useEffect(() => { load(); }, []);

  const { ok, loading, error, data } = status;
  const color = loading ? "#999" : ok ? "#0a7d00" : "#b00020";

  const rawUser = data?.user || {};
  const fallback =
    rawUser.name || rawUser.username || rawUser.full_name__v ||
    rawUser.user_name__v || rawUser.email || rawUser.id;

  const name = data?.displayName || fallback;

  const text = loading
    ? "Checking Vault connection..."
    : ok
      ? (name ? `Connected as ${name}` : "Connected")
      : `Vault not reachable${error ? `: ${error}` : ""}`;

  return (
    <div style={{
      width: "100%",
      padding: "6px 12px",
      background: color,
      color: "#fff",
      fontSize: 14,
      textAlign: "center",
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    }}>
      {text}
    </div>
  );
}
