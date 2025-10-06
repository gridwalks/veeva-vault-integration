import { useEffect, useState } from "react";
import { useAuth0 } from "@auth0/auth0-react";
import { listApproved, indexDocuments, getIndexedDocuments } from "./api";
import DocumentList from "./components/DocumentList.jsx";
import IndexedDocumentList from "./components/IndexedDocumentList.jsx";
import DocumentChat from "./components/DocumentChat.jsx";
import Header from "./components/Header.jsx";
import LeftMenu from "./components/LeftMenu.jsx";
// import StatusPanel from "./components/StatusPanel.jsx";

export default function App() {
  const { isAuthenticated, loginWithRedirect, logout, user } = useAuth0();
  const [q, setQ] = useState("");
  const [data, setData] = useState({ items: [], total: 0, pageOffset: 0, pageSize: 50 });
  const [indexedData, setIndexedData] = useState({ items: [], total: 0, pageOffset: 0, pageSize: 50 });
  const [activeTab, setActiveTab] = useState("documents");
  const [isIndexing, setIsIndexing] = useState(false);
  const [indexResult, setIndexResult] = useState(null);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [selectedDocuments, setSelectedDocuments] = useState([]);

  async function load(offset = 0) {
    console.log('Loading approved documents...', { query: q, offset });
    try {
      const res = await listApproved({ name: q, limit: 50, offset });
      console.log('Approved documents loaded successfully:', {
        total: res.total,
        items: res.items?.length || 0
      });
      setData(res);
    } catch (err) {
      console.error('Error loading approved documents:', {
        message: err.message,
        stack: err.stack,
        query: q,
        offset
      });
      setData({ items: [], total: 0, pageOffset: 0, pageSize: 50, error: err.message });
    }
  }

  async function loadIndexed(offset = 0) {
    console.log('Loading indexed documents...', { query: q, offset });
    try {
      const res = await getIndexedDocuments({ name: q, limit: 50, offset });
      console.log('Indexed documents loaded successfully:', {
        total: res.total,
        items: res.items?.length || 0,
        duration: res.duration
      });
      setIndexedData(res);
    } catch (err) {
      console.error('Error loading indexed documents:', {
        message: err.message,
        stack: err.stack,
        query: q,
        offset
      });
      setIndexedData({ items: [], total: 0, pageOffset: 0, pageSize: 50, error: err.message });
    }
  }

  async function handleIndexDocuments(forceRegenerate = false) {
    console.log('Starting document indexing process...', { query: q, forceRegenerate });
    setIsIndexing(true);
    setIndexResult(null);
    
    try {
      let batchOffset = 0;
      const batchSize = 5; // Process 5 documents at a time to avoid timeout
      let allResults = [];
      let batchCount = 0;
      
      while (true) {
        batchCount++;
        console.log(`Processing batch ${batchCount}...`, { batchOffset, batchSize });
        
        const res = await indexDocuments({ 
          name: q, 
          limit: 100, 
          force: forceRegenerate,
          batchSize,
          batchOffset 
        });
        
        console.log(`Batch ${batchCount} completed:`, {
          total: res.total,
          processed: res.processed,
          stats: res.stats,
          duration: res.duration,
          batchInfo: res.batchInfo
        });
        
        // Accumulate results
        if (res.results) {
          allResults = allResults.concat(res.results);
        }
        
        // Check if there are more batches to process
        if (!res.batchInfo?.hasMoreBatches) {
          console.log('All batches completed');
          break;
        }
        
        // Update offset for next batch
        batchOffset = res.batchInfo.nextBatchOffset;
        
        // Add a small delay between batches to avoid overwhelming the system
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
      // Create final result object
      const finalResult = {
        total: allResults.length > 0 ? allResults[0].total || allResults.length : 0,
        processed: allResults.length,
        duration: Date.now() - Date.now(), // Will be updated by individual batches
        stats: {
          created: allResults.filter(r => r.action === 'created').length,
          updated: allResults.filter(r => r.action === 'updated').length,
          unchanged: allResults.filter(r => r.action === 'unchanged').length,
          errors: allResults.filter(r => r.action === 'error').length
        },
        results: allResults,
        batchInfo: {
          totalBatches: batchCount,
          batchSize,
          completed: true
        }
      };
      
      console.log('Document indexing completed successfully:', finalResult);
      setIndexResult(finalResult);
      
      // Refresh indexed documents after indexing
      console.log('Refreshing indexed documents after indexing...');
      await loadIndexed(0);
    } catch (err) {
      console.error('Error during document indexing:', {
        message: err.message,
        stack: err.stack,
        query: q
      });
      setIndexResult({ error: err.message });
    } finally {
      setIsIndexing(false);
      console.log('Document indexing process finished');
    }
  }

  useEffect(() => { 
    console.log('App authentication state changed:', { isAuthenticated });
    if (isAuthenticated) {
      console.log('User authenticated, loading initial data...');
      load(0);
      loadIndexed(0);
    }
  }, [isAuthenticated]);

  if (!isAuthenticated) {
    return (
      <>
        <Header />
        <main style={{maxWidth: 860, margin: "20px auto", padding: "0 16px", textAlign: "center"}}>
          <h1>Approved Documents</h1>
          <p>Please log in to view documents.</p>
          <button onClick={() => loginWithRedirect()}>Log in</button>
        </main>
      </>
    );
  }

  return (
    <>
      <Header />
      <div style={{ textAlign: 'right', margin: '10px 16px 10px 90px' }}>
        {user && <span style={{ marginRight: 8 }}>Hello {user.name}</span>}
        <button onClick={() => logout({ logoutParams: { returnTo: window.location.origin } })}>Log out</button>
      </div>
      <main style={{maxWidth: 860, margin: "20px auto", padding: "0 16px 0 90px", textAlign: "center"}}>
        <h1>Approved Documents</h1>


        <form onSubmit={(e) => { 
          e.preventDefault(); 
          console.log('Search form submitted:', { query: q, activeTab });
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
              <button 
                disabled={data.pageOffset <= 0} 
                onClick={() => {
                  const newOffset = Math.max(0, data.pageOffset - data.pageSize);
                  console.log('Previous page clicked:', { newOffset, currentOffset: data.pageOffset });
                  load(newOffset);
                }}
              >
                Prev
              </button>
              <span>{data.pageOffset + 1}–{data.pageOffset + (data.items?.length || 0)} of {data.total}</span>
              <button 
                disabled={data.pageOffset + data.pageSize >= data.total} 
                onClick={() => {
                  const newOffset = data.pageOffset + data.pageSize;
                  console.log('Next page clicked:', { newOffset, currentOffset: data.pageOffset });
                  load(newOffset);
                }}
              >
                Next
              </button>
            </div>
          </>
        ) : (
          <>
            <IndexedDocumentList 
              items={indexedData.items} 
              onDocumentsSelected={setSelectedDocuments}
            />
            <div className="pager" style={{display:'flex', gap:12, alignItems:'center', marginTop:12}}>
              <button 
                disabled={indexedData.pageOffset <= 0} 
                onClick={() => {
                  const newOffset = Math.max(0, indexedData.pageOffset - indexedData.pageSize);
                  console.log('Previous indexed page clicked:', { newOffset, currentOffset: indexedData.pageOffset });
                  loadIndexed(newOffset);
                }}
              >
                Prev
              </button>
              <span>{indexedData.pageOffset + 1}–{indexedData.pageOffset + (indexedData.items?.length || 0)} of {indexedData.total}</span>
              <button 
                disabled={indexedData.pageOffset + indexedData.pageSize >= indexedData.total} 
                onClick={() => {
                  const newOffset = indexedData.pageOffset + indexedData.pageSize;
                  console.log('Next indexed page clicked:', { newOffset, currentOffset: indexedData.pageOffset });
                  loadIndexed(newOffset);
                }}
              >
                Next
              </button>
            </div>
          </>
        )}
      </main>

      {/* Document Chat Modal */}
      <DocumentChat
        isOpen={isChatOpen}
        onClose={() => setIsChatOpen(false)}
        selectedDocuments={selectedDocuments}
      />

      {/* Right Menu */}
      <RightMenu
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onChatOpen={() => setIsChatOpen(true)}
        indexedCount={indexedData.items.length}
        isIndexing={isIndexing}
        onIndexDocuments={handleIndexDocuments}
        onRegenerateSummaries={handleIndexDocuments}
      />
    </>
  );
}
