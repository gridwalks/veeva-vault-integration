import { useEffect, useState } from "react";

export default function StatusPanel() {
  const [state, setState] = useState({ loading: true });

  async function load() {
    setState(s => ({ ...s, loading: true, error: null }));
    try {
      const res = await fetch("/api/readiness");
      const json = await res.json();
      setState({ loading: false, data: json, error: res.ok ? null : json?.error || "Failed" });
    } catch (e) {
      setState({ loading: false, error: e.message });
    }
  }

  useEffect(() => { load(); }, []);

  const { loading, data, error } = state;
  const ok = data?.ok;

  return (
    <section className="status-panel" style={{border:'1px solid #ddd', borderRadius:12, padding:16, marginTop:16}}>
      <header style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
        <h2 style={{margin:0}}>Vault Connection Status</h2>
        <button onClick={load} disabled={loading} style={{padding:'6px 12px'}}>
          {loading ? "Checking…" : "Re-check"}
        </button>
      </header>

      {error && <p style={{color:'#b00020', marginTop:12}}>Error: {String(error)}</p>}

      {data && (
        <div style={{marginTop:12}}>
          <p>
            Overall: <strong style={{color: ok ? '#0a7d00' : '#b00020'}}>
              {ok ? "OK" : "NOT OK"}
            </strong>
          </p>
          <ul style={{listStyle:'none', paddingLeft:0, lineHeight:1.7}}>
            <li>
              Limits check: <strong style={{color: data.checks?.limits?.ok ? '#0a7d00' : '#b00020'}}>
                {data.checks?.limits?.ok ? "OK" : "Failed"}
              </strong>
            </li>
            <li>
              Who am I: <strong style={{color: data.checks?.whoami?.ok ? '#0a7d00' : '#b00020'}}>
                {data.checks?.whoami?.ok ? "OK" : "Failed"}
              </strong>
              {data.user && (
                <span> — {data.user?.name || data.user?.username || data.user?.id}</span>
              )}
            </li>
          </ul>
          <div style={{fontSize:12, color:'#555'}}>Last checked: {new Date(data.timestamp).toLocaleString()}</div>
        </div>
      )}
    </section>
  );
}
