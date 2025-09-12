import { useEffect, useState } from "react";
import { listApproved } from "./api";
import DocumentList from "./components/DocumentList.jsx";
import StatusBar from "./components/StatusBar.jsx";
// import StatusPanel from "./components/StatusPanel.jsx";

export default function App() {
  const [q, setQ] = useState("");
  const [data, setData] = useState({ items: [], total: 0, pageOffset: 0, pageSize: 50 });

  async function load(offset = 0) {
    const res = await listApproved({ name: q, limit: 50, offset });
    setData(res);
  }

  useEffect(() => { load(0); }, []);

  return (
    <>
      <StatusBar />
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

        <DocumentList items={data.items} />

        <div className="pager" style={{display:'flex', gap:12, alignItems:'center', marginTop:12}}>
          <button disabled={data.pageOffset <= 0} onClick={() => load(Math.max(0, data.pageOffset - data.pageSize))}>Prev</button>
          <span>{data.pageOffset + 1}–{data.pageOffset + data.items.length} of {data.total}</span>
          <button disabled={data.pageOffset + data.pageSize >= data.total} onClick={() => load(data.pageOffset + data.pageSize)}>Next</button>
        </div>
      </main>
    </>
  );
}
