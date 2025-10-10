import { useEffect, useState } from "react";
import { indexDocuments, getIndexedDocuments } from "../api";
import IndexedDocumentList from "./IndexedDocumentList.jsx";
import DocumentUpload from "./DocumentUpload.jsx";
import ExternalResources from "./ExternalResources.jsx";
import QAManagement from "./QAManagement.jsx";
import WorkflowManagement from "./WorkflowManagement.jsx";

export default function AdminScreen() {
  const [q, setQ] = useState("");
  const [indexedData, setIndexedData] = useState({ items: [], total: 0, pageOffset: 0, pageSize: 50 });
  const [activeTab, setActiveTab] = useState("indexed");
  const [isIndexing, setIsIndexing] = useState(false);
  const [indexResult, setIndexResult] = useState(null);
  const [selectedDocuments, setSelectedDocuments] = useState([]);

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
    console.log('Admin screen mounted, loading initial data...');
    loadIndexed(0);
  }, []);

  return (
    <div style={{
      height: 'calc(100vh - 60px)',
      margin: '0 40px 0 40px',
      padding: '16px',
      backgroundColor: '#ffffff',
      border: '1px solid #e5e7eb',
      borderRadius: '8px',
      overflow: 'auto',
      boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)'
    }}>
      <h1 style={{ 
        margin: '0 0 12px 0', 
        textAlign: 'center', 
        color: '#374151',
        fontSize: '18px',
        fontWeight: '600',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
      }}>
        Document Administration
      </h1>

      {/* Tab Navigation */}
      <div style={{display: 'flex', gap: '6px', marginBottom: '12px', justifyContent: 'center', flexWrap: 'wrap'}}>
        <button
          onClick={() => {
            console.log('Switching to indexed documents tab');
            setActiveTab("indexed");
          }}
          style={{
            padding: '6px 12px',
            backgroundColor: activeTab === "indexed" ? '#4338ca' : '#f3f4f6',
            color: activeTab === "indexed" ? 'white' : '#374151',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '12px',
            fontWeight: '500',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            transition: 'all 0.2s ease'
          }}
        >
          Indexed Documents
        </button>
        <button
          onClick={() => {
            console.log('Switching to upload tab');
            setActiveTab("upload");
          }}
          style={{
            padding: '6px 12px',
            backgroundColor: activeTab === "upload" ? '#4338ca' : '#f3f4f6',
            color: activeTab === "upload" ? 'white' : '#374151',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '12px',
            fontWeight: '500',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            transition: 'all 0.2s ease'
          }}
        >
          Upload Documents
        </button>
        <button
          onClick={() => {
            console.log('Switching to external resources tab');
            setActiveTab("external");
          }}
          style={{
            padding: '6px 12px',
            backgroundColor: activeTab === "external" ? '#4338ca' : '#f3f4f6',
            color: activeTab === "external" ? 'white' : '#374151',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '12px',
            fontWeight: '500',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            transition: 'all 0.2s ease'
          }}
        >
          External Resources
        </button>
        <button
          onClick={() => {
            console.log('Switching to Q&A management tab');
            setActiveTab("qa");
          }}
          style={{
            padding: '6px 12px',
            backgroundColor: activeTab === "qa" ? '#4338ca' : '#f3f4f6',
            color: activeTab === "qa" ? 'white' : '#374151',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '12px',
            fontWeight: '500',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            transition: 'all 0.2s ease'
          }}
        >
          Q&A Management
        </button>
        <button
          onClick={() => {
            console.log('Switching to workflow management tab');
            setActiveTab("workflow");
          }}
          style={{
            padding: '6px 12px',
            backgroundColor: activeTab === "workflow" ? '#4338ca' : '#f3f4f6',
            color: activeTab === "workflow" ? 'white' : '#374151',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '12px',
            fontWeight: '500',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            transition: 'all 0.2s ease'
          }}
        >
          Workflow Management
        </button>
        <button
          onClick={() => {
            console.log('Switching to workflow history tab');
            setActiveTab("history");
          }}
          style={{
            padding: '6px 12px',
            backgroundColor: activeTab === "history" ? '#4338ca' : '#f3f4f6',
            color: activeTab === "history" ? 'white' : '#374151',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '12px',
            fontWeight: '500',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            transition: 'all 0.2s ease'
          }}
        >
          Workflow History
        </button>
      </div>

      {/* Search form - only show for indexed tab */}
      {activeTab === "indexed" && (
        <form onSubmit={(e) => { 
          e.preventDefault(); 
          console.log('Search form submitted:', { query: q, activeTab });
          loadIndexed(0);
        }} style={{display:'flex', gap:6, margin:'0 0 12px 0'}}>
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Filter by name…"
            style={{flex:1, padding:'6px 10px', border: '1px solid #ddd', borderRadius: '4px', fontSize:'12px'}}
          />
          <button style={{padding:'6px 12px', backgroundColor: '#007bff', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize:'12px'}}>Search</button>
          <button
            type="button"
            onClick={() => handleIndexDocuments(false)}
            disabled={isIndexing}
            style={{
              padding:'6px 12px',
              backgroundColor: isIndexing ? '#ccc' : '#28a745',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: isIndexing ? 'not-allowed' : 'pointer',
              fontSize:'12px'
            }}
          >
            {isIndexing ? 'Indexing...' : 'Index Documents'}
          </button>
          <button
            type="button"
            onClick={() => handleIndexDocuments(true)}
            disabled={isIndexing}
            style={{
              padding:'6px 12px',
              backgroundColor: isIndexing ? '#ccc' : '#ff6b35',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: isIndexing ? 'not-allowed' : 'pointer',
              fontSize:'12px'
            }}
          >
            {isIndexing ? 'Regenerating...' : 'Regenerate Summaries'}
          </button>
        </form>
      )}

      {/* Index Results */}
      {indexResult && (
        <div style={{
          backgroundColor: indexResult.error ? '#f8d7da' : '#d4edda',
          color: indexResult.error ? '#721c24' : '#155724',
          padding: '10px',
          borderRadius: '4px',
          marginBottom: '12px',
          textAlign: 'left',
          fontSize: '12px'
        }}>
          {indexResult.error ? (
            <p style={{margin:0}}><strong>Error:</strong> {indexResult.error}</p>
          ) : (
            <div>
              <p style={{margin:'0 0 4px 0'}}><strong>Indexing Complete!</strong></p>
              <p style={{margin:'4px 0'}}>Total documents: {indexResult.total}</p>
              <p style={{margin:'4px 0'}}>Processed: {indexResult.processed}</p>
              <p style={{margin:'4px 0 0 0'}}>
                Created: {indexResult.results?.filter(r => r.action === 'created').length || 0} | 
                Updated: {indexResult.results?.filter(r => r.action === 'updated').length || 0} | 
                Unchanged: {indexResult.results?.filter(r => r.action === 'unchanged').length || 0}
              </p>
            </div>
          )}
        </div>
      )}

      {indexedData.error && <p style={{color:'#b00020'}}>Error: {indexedData.error}</p>}

      {/* Content based on active tab */}
      {activeTab === "indexed" ? (
        <>
          <IndexedDocumentList 
            items={indexedData.items} 
            onDocumentsSelected={setSelectedDocuments}
          />
          <div className="pager" style={{display:'flex', gap:8, alignItems:'center', marginTop:10}}>
            <button 
              disabled={indexedData.pageOffset <= 0} 
              onClick={() => {
                const newOffset = Math.max(0, indexedData.pageOffset - indexedData.pageSize);
                console.log('Previous indexed page clicked:', { newOffset, currentOffset: indexedData.pageOffset });
                loadIndexed(newOffset);
              }}
              style={{padding:'5px 10px', fontSize:'11px', borderRadius:'4px', cursor:'pointer', border:'1px solid #ddd', backgroundColor:'#fff'}}
            >
              Prev
            </button>
            <span style={{fontSize:'11px', color:'#666'}}>{indexedData.pageOffset + 1}–{indexedData.pageOffset + (indexedData.items?.length || 0)} of {indexedData.total}</span>
            <button 
              disabled={indexedData.pageOffset + indexedData.pageSize >= indexedData.total} 
              onClick={() => {
                const newOffset = indexedData.pageOffset + indexedData.pageSize;
                console.log('Next indexed page clicked:', { newOffset, currentOffset: indexedData.pageOffset });
                loadIndexed(newOffset);
              }}
              style={{padding:'5px 10px', fontSize:'11px', borderRadius:'4px', cursor:'pointer', border:'1px solid #ddd', backgroundColor:'#fff'}}
            >
              Next
            </button>
          </div>
        </>
      ) : activeTab === "upload" ? (
        <DocumentUpload 
          onUploadComplete={(result) => {
            console.log('Upload completed:', result);
            // Refresh indexed documents after upload
            if (result.success) {
              loadIndexed(0);
            }
          }}
        />
      ) : activeTab === "external" ? (
        <ExternalResources />
      ) : activeTab === "qa" ? (
        <QAManagement />
      ) : activeTab === "workflow" ? (
        <WorkflowManagement />
      ) : activeTab === "history" ? (
        <WorkflowHistory />
      ) : null}

      {/* Selected Documents for Chat */}
      <div style={{
        marginTop: '16px',
        padding: '12px',
        backgroundColor: '#f8fafc',
        border: '1px solid #e5e7eb',
        borderRadius: '6px'
      }}>
        <h3 style={{
          margin: '0 0 8px 0',
          fontSize: '14px',
          fontWeight: '600',
          color: '#374151',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
        }}>
          Selected Documents for Chat
        </h3>
        <p style={{
          margin: '0 0 12px 0',
          fontSize: '12px',
          color: '#6b7280',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
        }}>
          Select documents below to use them in the chat interface.
        </p>
        
        {selectedDocuments.length > 0 ? (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '8px'
          }}>
            {selectedDocuments.map((doc, index) => (
              <div key={index} style={{
                padding: '8px',
                backgroundColor: '#ffffff',
                border: '1px solid #e5e7eb',
                borderRadius: '4px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <div>
                  <div style={{
                    fontSize: '12px',
                    fontWeight: '500',
                    color: '#374151',
                    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                  }}>
                    {doc.document_name}
                  </div>
                  <div style={{
                    fontSize: '11px',
                    color: '#6b7280',
                    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                  }}>
                    {doc.document_type} • v{doc.version}
                  </div>
                </div>
                <button
                  onClick={() => {
                    setSelectedDocuments(prev => prev.filter((_, i) => i !== index));
                  }}
                  style={{
                    padding: '4px 8px',
                    backgroundColor: '#dc2626',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '3px',
                    fontSize: '11px',
                    cursor: 'pointer',
                    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                  }}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div style={{
            padding: '16px',
            textAlign: 'center',
            color: '#6b7280',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
          }}>
            <div style={{ fontSize: '24px', marginBottom: '6px' }}>📄</div>
            <p style={{ margin: 0, fontSize: '12px' }}>No documents selected for chat</p>
          </div>
        )}
      </div>
    </div>
  );
}
