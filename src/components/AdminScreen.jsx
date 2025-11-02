import { useEffect, useState } from "react";
import { indexDocuments, getIndexedDocuments } from "../api";
import IndexedDocumentList from "./IndexedDocumentList.jsx";
import BlobDocumentList from "./BlobDocumentList.jsx";
import DocumentUpload from "./DocumentUpload.jsx";
import ExternalResources from "./ExternalResources.jsx";
import QAManagement from "./QAManagement.jsx";
import WorkflowManagement from "./WorkflowManagement.jsx";
import IndexingLogs from "./IndexingLogs.jsx";
import CfrTitle21 from "./CfrTitle21.jsx";
import UserManagement from "./UserManagement.jsx";

export default function AdminScreen({ userId }) {
  const [q, setQ] = useState("");
  const [indexedData, setIndexedData] = useState({ items: [], total: 0, pageOffset: 0, pageSize: 50 });
  const [activeTab, setActiveTab] = useState("indexed");
  const [isIndexing, setIsIndexing] = useState(false);
  const [indexResult, setIndexResult] = useState(null);

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
        
        // Retry logic for failed batches
        let res;
        let retryCount = 0;
        const maxRetries = 3;
        
        while (retryCount < maxRetries) {
          try {
            res = await indexDocuments({ 
              name: q, 
              limit: 100, 
              force: forceRegenerate,
              batchSize,
              batchOffset 
            });
            break; // Success, exit retry loop
          } catch (error) {
            retryCount++;
            console.warn(`Batch ${batchCount} failed (attempt ${retryCount}/${maxRetries}):`, error.message);
            
            if (retryCount < maxRetries) {
              const delay = Math.pow(2, retryCount) * 1000; // Exponential backoff
              console.log(`Retrying in ${delay}ms...`);
              await new Promise(resolve => setTimeout(resolve, delay));
            } else {
              console.error(`Batch ${batchCount} failed after ${maxRetries} attempts:`, error);
              throw error;
            }
          }
        }
        
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
            console.log('Switching to blob documents tab');
            setActiveTab("blob");
          }}
          style={{
            padding: '6px 12px',
            backgroundColor: activeTab === "blob" ? '#4338ca' : '#f3f4f6',
            color: activeTab === "blob" ? 'white' : '#374151',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '12px',
            fontWeight: '500',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            transition: 'all 0.2s ease'
          }}
        >
          Blob Documents
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
            console.log('Switching to CFR Title 21 tab');
            setActiveTab("cfr");
          }}
          style={{
            padding: '6px 12px',
            backgroundColor: activeTab === "cfr" ? '#4338ca' : '#f3f4f6',
            color: activeTab === "cfr" ? 'white' : '#374151',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '12px',
            fontWeight: '500',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            transition: 'all 0.2s ease'
          }}
        >
          CFR Title 21
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
            console.log('Switching to indexing logs tab');
            setActiveTab("logs");
          }}
          style={{
            padding: '6px 12px',
            backgroundColor: activeTab === "logs" ? '#4338ca' : '#f3f4f6',
            color: activeTab === "logs" ? 'white' : '#374151',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '12px',
            fontWeight: '500',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            transition: 'all 0.2s ease'
          }}
        >
          Indexing Logs
        </button>
        <button
          onClick={() => {
            console.log('Switching to user management tab');
            setActiveTab("users");
          }}
          style={{
            padding: '6px 12px',
            backgroundColor: activeTab === "users" ? '#4338ca' : '#f3f4f6',
            color: activeTab === "users" ? 'white' : '#374151',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '12px',
            fontWeight: '500',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            transition: 'all 0.2s ease'
          }}
        >
          User Management
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
          {/* Total count display */}
          <div style={{
            backgroundColor: '#f8f9fa',
            border: '1px solid #e9ecef',
            borderRadius: '6px',
            padding: '12px',
            marginBottom: '12px',
            textAlign: 'center'
          }}>
            <div style={{
              fontSize: '14px',
              fontWeight: '600',
              color: '#495057',
              marginBottom: '4px'
            }}>
              Total Indexed Documents
            </div>
            <div style={{
              fontSize: '24px',
              fontWeight: '700',
              color: '#007bff'
            }}>
              {indexedData.total || 0}
            </div>
          </div>
          
          <IndexedDocumentList 
            items={indexedData.items}
            onDocumentDeleted={(deletedId) => {
              console.log('Document deleted, refreshing list...', deletedId);
              loadIndexed(indexedData.pageOffset);
            }}
            onSummaryUpdated={(documentId) => {
              console.log('Summary updated, refreshing list...', documentId);
              loadIndexed(indexedData.pageOffset);
            }}
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
          userId={userId}
          onUploadComplete={(result) => {
            console.log('Upload completed:', result);
            // Refresh indexed documents after upload
            if (result.success) {
              loadIndexed(0);
            }
          }}
        />
      ) : activeTab === "blob" ? (
        <BlobDocumentList
          userId={userId}
          onDocumentDeleted={(deletedId) => {
            console.log('Blob document deleted, refreshing list...', deletedId);
            // The BlobDocumentList component handles its own refresh
          }}
        />
      ) : activeTab === "external" ? (
        <ExternalResources />
      ) : activeTab === "cfr" ? (
        <CfrTitle21 />
      ) : activeTab === "qa" ? (
        <QAManagement />
      ) : activeTab === "workflow" ? (
        <WorkflowManagement />
      ) : activeTab === "logs" ? (
        <IndexingLogs />
      ) : activeTab === "users" ? (
        <UserManagement />
      ) : null}
    </div>
  );
}
