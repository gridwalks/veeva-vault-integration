import { useEffect, useState } from "react";
import { useAuth0 } from "@auth0/auth0-react";
import { listApproved, indexDocuments, getIndexedDocuments } from "./api";
import DocumentList from "./components/DocumentList.jsx";
import IndexedDocumentList from "./components/IndexedDocumentList.jsx";
import StatusBar from "./components/StatusBar.jsx";
// import StatusPanel from "./components/StatusPanel.jsx";
import yprimeLogo from "../assets/YP_New_Logo.png";

export default function App() {
  const { isAuthenticated, loginWithRedirect, logout, user } = useAuth0();
  const [q, setQ] = useState("");
  const [data, setData] = useState({ items: [], total: 0, pageOffset: 0, pageSize: 50 });
  const [indexedData, setIndexedData] = useState({ items: [], total: 0, pageOffset: 0, pageSize: 50 });
  const [activeTab, setActiveTab] = useState("documents");
  const [isIndexing, setIsIndexing] = useState(false);
  const [indexResult, setIndexResult] = useState(null);

  async function load(offset = 0) {
    try {
      const res = await listApproved({ name: q, limit: 50, offset });
      setData(res);
    } catch (err) {
      console.error(err);
      setData({ items: [], total: 0, pageOffset: 0, pageSize: 50, error: err.message });
    }
  }

  async function loadIndexed(offset = 0) {
    try {
      const res = await getIndexedDocuments({ name: q, limit: 50, offset });
      setIndexedData(res);
    } catch (err) {
      console.error(err);
      setIndexedData({ items: [], total: 0, pageOffset: 0, pageSize: 50, error: err.message });
    }
  }

  async function handleIndexDocuments() {
    setIsIndexing(true);
    setIndexResult(null);
    try {
      const res = await indexDocuments({ name: q, limit: 100 });
      setIndexResult(res);
      // Refresh indexed documents after indexing
      await loadIndexed(0);
    } catch (err) {
      console.error(err);
      setIndexResult({ error: err.message });
    } finally {
      setIsIndexing(false);
    }
  }

  useEffect(() => { 
    if (isAuthenticated) {
      load(0);
      loadIndexed(0);
    }
  }, [isAuthenticated]);

  if (!isAuthenticated) {
    return (
      <>
        <StatusBar />
        <main style={{maxWidth: 860, margin: "20px auto", padding: "0 16px", textAlign: "center"}}>
          <img src={yprimeLogo} alt="YPrime logo" style={{ height: 40, margin: "0 auto 20px" }} />
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
      <main style={{maxWidth: 860, margin: "20px auto", padding: "0 16px", textAlign: "center"}}>
        <img src={yprimeLogo} alt="YPrime logo" style={{ height: 40, margin: "0 auto 20px" }} />
        <h1>Approved Documents</h1>

        {/* Tab Navigation */}
        <div style={{display: 'flex', gap: '8px', marginBottom: '20px', justifyContent: 'center'}}>
          <button
            onClick={() => setActiveTab("documents")}
            style={{
              padding: '8px 16px',
              backgroundColor: activeTab === "documents" ? '#007bff' : '#f0f0f0',
              color: activeTab === "documents" ? 'white' : 'black',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            Veeva Documents
          </button>
          <button
            onClick={() => setActiveTab("indexed")}
            style={{
              padding: '8px 16px',
              backgroundColor: activeTab === "indexed" ? '#007bff' : '#f0f0f0',
              color: activeTab === "indexed" ? 'white' : 'black',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            Indexed Documents
          </button>
        </div>

        <form onSubmit={(e) => { 
          e.preventDefault(); 
          if (activeTab === "documents") load(0);
          else loadIndexed(0);
        }} style={{display:'flex', gap:8, margin:'12px 0 20px'}}>
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Filter by name…"
            style={{flex:1, padding:'8px 10px'}}
          />
          <button style={{padding:'8px 12px'}}>Search</button>
          {activeTab === "documents" && (
            <button
              type="button"
              onClick={handleIndexDocuments}
              disabled={isIndexing}
              style={{
                padding:'8px 12px',
                backgroundColor: isIndexing ? '#ccc' : '#28a745',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: isIndexing ? 'not-allowed' : 'pointer'
              }}
            >
              {isIndexing ? 'Indexing...' : 'Index Documents'}
            </button>
          )}
        </form>

        {/* Index Results */}
        {indexResult && (
          <div style={{
            backgroundColor: indexResult.error ? '#f8d7da' : '#d4edda',
            color: indexResult.error ? '#721c24' : '#155724',
            padding: '12px',
            borderRadius: '4px',
            marginBottom: '16px',
            textAlign: 'left'
          }}>
            {indexResult.error ? (
              <p><strong>Error:</strong> {indexResult.error}</p>
            ) : (
              <div>
                <p><strong>Indexing Complete!</strong></p>
                <p>Total documents: {indexResult.total}</p>
                <p>Processed: {indexResult.processed}</p>
                <p>
                  Created: {indexResult.results?.filter(r => r.action === 'created').length || 0} | 
                  Updated: {indexResult.results?.filter(r => r.action === 'updated').length || 0} | 
                  Unchanged: {indexResult.results?.filter(r => r.action === 'unchanged').length || 0}
                </p>
              </div>
            )}
          </div>
        )}

        {data.error && <p style={{color:'#b00020'}}>Error: {data.error}</p>}
        {indexedData.error && <p style={{color:'#b00020'}}>Error: {indexedData.error}</p>}

        {/* Content based on active tab */}
        {activeTab === "documents" ? (
          <>
            <DocumentList items={data.items} />
            <div className="pager" style={{display:'flex', gap:12, alignItems:'center', marginTop:12}}>
              <button disabled={data.pageOffset <= 0} onClick={() => load(Math.max(0, data.pageOffset - data.pageSize))}>Prev</button>
              <span>{data.pageOffset + 1}–{data.pageOffset + (data.items?.length || 0)} of {data.total}</span>
              <button disabled={data.pageOffset + data.pageSize >= data.total} onClick={() => load(data.pageOffset + data.pageSize)}>Next</button>
            </div>
          </>
        ) : (
          <>
            <IndexedDocumentList items={indexedData.items} />
            <div className="pager" style={{display:'flex', gap:12, alignItems:'center', marginTop:12}}>
              <button disabled={indexedData.pageOffset <= 0} onClick={() => loadIndexed(Math.max(0, indexedData.pageOffset - indexedData.pageSize))}>Prev</button>
              <span>{indexedData.pageOffset + 1}–{indexedData.pageOffset + (indexedData.items?.length || 0)} of {indexedData.total}</span>
              <button disabled={indexedData.pageOffset + indexedData.pageSize >= indexedData.total} onClick={() => loadIndexed(indexedData.pageOffset + indexedData.pageSize)}>Next</button>
            </div>
          </>
        )}
      </main>
    </>
  );
}
