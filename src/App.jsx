import { useEffect, useState } from "react";
import { useAuth0 } from "@auth0/auth0-react";
import { listApproved } from "./api";
import DocumentList from "./components/DocumentList.jsx";
import StatusBar from "./components/StatusBar.jsx";
// import StatusPanel from "./components/StatusPanel.jsx";

export default function App() {
  const { isAuthenticated, loginWithRedirect, logout, user } = useAuth0();
  const [q, setQ] = useState("");
  const [data, setData] = useState({ items: [], total: 0, pageOffset: 0, pageSize: 50 });

  async function load(offset = 0) {
    try {
      const res = await listApproved({ name: q, limit: 50, offset });
      setData(res);
    } catch (err) {
      console.error(err);
      setData({ items: [], total: 0, pageOffset: 0, pageSize: 50, error: err.message });
    }
  }

  useEffect(() => { if (isAuthenticated) load(0); }, [isAuthenticated]);

  if (!isAuthenticated) {
    return (
      <>
        <StatusBar />
        <main style={{maxWidth: 860, margin: "20px auto", padding: "0 16px"}}>
          <h1>Approved Documents</h1>
          <p>Please log in to view documents.</p>
          <button onClick={() => loginWithRedirect()}>Log in</button>
        </main>
      </>
    );
  }

  return (
    <>
      <StatusBar />
      <div style={{ textAlign: 'right', margin: '10px 16px' }}>
        {user && <span style={{ marginRight: 8 }}>Hello {user.name}</span>}
        <button onClick={() => logout({ logoutParams: { returnTo: window.location.origin } })}>Log out</button>
      </div>
      <main style={{maxWidth: 860, margin: "20px auto", padding: "0 16px"}}>
        <h1>Approved Documents</h1>

        <form onSubmit={(e) => { e.preventDefault(); load(0); }} style={{display:'flex', gap:8, margin:'12px 0 20px'}}>
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Filter by name…"
            style={{flex:1, padding:'8px 10px'}}
          />
          <button style={{padding:'8px 12px'}}>Search</button>
        </form>

        {data.error && <p style={{color:'#b00020'}}>Error: {data.error}</p>}

        <DocumentList items={data.items} />

        <div className="pager" style={{display:'flex', gap:12, alignItems:'center', marginTop:12}}>
          <button disabled={data.pageOffset <= 0} onClick={() => load(Math.max(0, data.pageOffset - data.pageSize))}>Prev</button>
          <span>{data.pageOffset + 1}–{data.pageOffset + (data.items?.length || 0)} of {data.total}</span>
          <button disabled={data.pageOffset + data.pageSize >= data.total} onClick={() => load(data.pageOffset + data.pageSize)}>Next</button>
        </div>
      </main>
    </>
  );
}
