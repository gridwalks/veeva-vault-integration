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

  const { ok, loading, error } = status;
  const color = loading ? "#999" : ok ? "#0a7d00" : "#b00020";
  const text = loading
    ? "Checking Vault connection..."
    : ok
      ? `Connected as ${status.data?.user?.name || status.data?.user?.username}`
      : `Vault not reachable${error ? `: ${error}` : ""}`;

  return (
    <div style={{
      width: "100%",
      padding: "6px 12px",
      background: color,
      color: "#fff",
      fontSize: 14,
      textAlign: "center",
    }}>
      {text}
    </div>
  );
}
