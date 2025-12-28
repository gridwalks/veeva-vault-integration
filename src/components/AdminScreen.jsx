import { useEffect, useState } from "react";
import { useAuth0 } from '@auth0/auth0-react';
import { indexDocuments, getIndexedDocuments, getSystemSettings, updateSystemSetting, deleteVeevaData } from "../api";
import IndexedDocumentList from "./IndexedDocumentList.jsx";
import BlobDocumentList from "./BlobDocumentList.jsx";
import DocumentUpload from "./DocumentUpload.jsx";
import ExternalResources from "./ExternalResources.jsx";
import QAManagement from "./QAManagement.jsx";
import WorkflowManagement from "./WorkflowManagement.jsx";
import IndexingLogs from "./IndexingLogs.jsx";
import CfrTitle21 from "./CfrTitle21.jsx";
import UserManagement from "./UserManagement.jsx";
import VeevaDocumentList from "./VeevaDocumentList.jsx";
import CourseAuthoring from "./CourseAuthoring.jsx";
import EducationalAnalytics from "./EducationalAnalytics.jsx";

export default function AdminScreen({ userId }) {
  const { getAccessTokenSilently } = useAuth0();
  const [q, setQ] = useState("");
  const [indexedData, setIndexedData] = useState({ items: [], total: 0, pageOffset: 0, pageSize: 50 });
  const [activeTab, setActiveTab] = useState("indexed");
  const [isIndexing, setIsIndexing] = useState(false);
  const [indexResult, setIndexResult] = useState(null);
  const [veevaIntegrationEnabled, setVeevaIntegrationEnabled] = useState(true);
  const [isLoadingSettings, setIsLoadingSettings] = useState(false);
  const [settingsError, setSettingsError] = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeletingVeevaData, setIsDeletingVeevaData] = useState(false);
  const [deleteError, setDeleteError] = useState(null);

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
    loadSystemSettings();
  }, []);

  async function loadSystemSettings() {
    setIsLoadingSettings(true);
    setSettingsError(null);
    try {
      const accessToken = await getAccessTokenSilently();
      const result = await getSystemSettings({ 
        setting_key: 'veeva_integration_enabled',
        accessToken 
      });
      if (result.setting) {
        setVeevaIntegrationEnabled(result.setting.value);
      }
    } catch (err) {
      console.error('Error loading system settings:', err);
      setSettingsError(err.message);
      // Default to enabled if we can't load settings
      setVeevaIntegrationEnabled(true);
    } finally {
      setIsLoadingSettings(false);
    }
  }

  async function handleToggleVeevaIntegration(enabled) {
    setIsLoadingSettings(true);
    setSettingsError(null);
    try {
      const accessToken = await getAccessTokenSilently();
      await updateSystemSetting({
        setting_key: 'veeva_integration_enabled',
        setting_value: enabled,
        accessToken
      });
      setVeevaIntegrationEnabled(enabled);
      
      // If disabling and user is on veeva-documents tab, switch to indexed tab
      if (!enabled && activeTab === 'veeva-documents') {
        setActiveTab('indexed');
      }
    } catch (err) {
      console.error('Error updating system settings:', err);
      setSettingsError(err.message);
      // Revert the toggle on error
      setVeevaIntegrationEnabled(!enabled);
    } finally {
      setIsLoadingSettings(false);
    }
  }

  async function handleDeleteVeevaData() {
    setIsDeletingVeevaData(true);
    setDeleteError(null);
    try {
      const accessToken = await getAccessTokenSilently();
      const result = await deleteVeevaData({ accessToken });
      
      console.log('Veeva data deleted successfully:', result);
      
      // Close confirmation dialog
      setShowDeleteConfirm(false);
      
      // Refresh indexed documents to reflect the deletion
      await loadIndexed(0);
      
      // Show success message (you could add a success state here)
      alert(`Successfully deleted ${result.deletedDocuments} Veeva documents and ${result.deletedChunks} chunks from the database.`);
    } catch (err) {
      console.error('Error deleting Veeva data:', err);
      setDeleteError(err.message);
    } finally {
      setIsDeletingVeevaData(false);
    }
  }

  const menuGroups = [
    {
      header: "Knowledge Management",
      items: [
        { id: "indexed", label: "Indexed Documents", requiresVeeva: false },
        ...(veevaIntegrationEnabled ? [{ id: "veeva-documents", label: "Available Documents in Veeva", requiresVeeva: true }] : []),
        { id: "upload", label: "Upload Documents", requiresVeeva: false },
        { id: "blob", label: "Blob Documents", requiresVeeva: false },
        { id: "external", label: "External Resources", requiresVeeva: false },
        { id: "cfr", label: "CFR Title 21", requiresVeeva: false },
        { id: "qa", label: "Q&A Management", requiresVeeva: false }
      ]
    },
    {
      header: "Workflow Management",
      items: [
        { id: "workflow", label: "Workflow Management", requiresVeeva: false }
      ]
    },
    {
      header: "Education Management",
      items: [
        { id: "course-authoring", label: "Course Authoring", requiresVeeva: false },
        { id: "educational-analytics", label: "Educational Analytics", requiresVeeva: false }
      ]
    },
    {
      header: "User Management",
      items: [
        { id: "users", label: "User Management", requiresVeeva: false }
      ]
    },
    {
      header: "System Settings",
      items: [
        { id: "settings", label: "System Settings", requiresVeeva: false }
      ]
    },
    {
      header: "Logs",
      items: [
        { id: "logs", label: "Indexing Logs", requiresVeeva: false }
      ]
    }
  ];

  return (
    <div style={{
      height: 'calc(100vh - 60px)',
      margin: '0 40px 0 40px',
      display: 'flex',
      backgroundColor: '#ffffff',
      border: '1px solid #e5e7eb',
      borderRadius: '8px',
      boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
      overflow: 'hidden'
    }}>
      {/* Left Sidebar Menu */}
      <div style={{
        width: '240px',
        backgroundColor: '#f9fafb',
        borderRight: '1px solid #e5e7eb',
        overflowY: 'auto',
        padding: '16px 0'
      }}>
        <h2 style={{
          margin: '0 16px 20px 16px',
          paddingBottom: '12px',
          borderBottom: '2px solid #e5e7eb',
          color: '#374151',
          fontSize: '16px',
          fontWeight: '600',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
        }}>
          Administration
        </h2>
        
        {menuGroups.map((group, groupIndex) => (
          <div key={groupIndex} style={{ marginBottom: '24px' }}>
            <div style={{
              padding: '8px 16px',
              color: '#6b7280',
              fontSize: '11px',
              fontWeight: '600',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
            }}>
              {group.header}
            </div>
            {group.items.map((item) => (
              <button
                key={item.id}
                onClick={() => {
                  console.log(`Switching to ${item.label}`);
                  setActiveTab(item.id);
                }}
                style={{
                  width: '100%',
                  padding: '10px 16px',
                  backgroundColor: activeTab === item.id ? '#4338ca' : 'transparent',
                  color: activeTab === item.id ? 'white' : '#374151',
                  border: 'none',
                  borderLeft: activeTab === item.id ? '3px solid #4338ca' : '3px solid transparent',
                  cursor: 'pointer',
                  fontSize: '13px',
                  fontWeight: activeTab === item.id ? '500' : '400',
                  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                  transition: 'all 0.2s ease',
                  textAlign: 'left',
                  display: 'block',
                  marginLeft: activeTab === item.id ? '0' : '3px'
                }}
                onMouseEnter={(e) => {
                  if (activeTab !== item.id) {
                    e.target.style.backgroundColor = '#f3f4f6';
                  }
                }}
                onMouseLeave={(e) => {
                  if (activeTab !== item.id) {
                    e.target.style.backgroundColor = 'transparent';
                  }
                }}
              >
                {item.label}
              </button>
            ))}
          </div>
        ))}
      </div>

      {/* Main Content Area */}
      <div style={{
        flex: 1,
        overflow: 'auto',
        padding: '16px'
      }}>
        {/* Page Title */}
        <h1 style={{ 
          margin: '0 0 20px 0', 
          color: '#374151',
          fontSize: '20px',
          fontWeight: '600',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
        }}>
          {menuGroups
            .flatMap(group => group.items)
            .find(item => item.id === activeTab)?.label || 'Administration'}
        </h1>

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
            disabled={isIndexing || !veevaIntegrationEnabled}
            style={{
              padding:'6px 12px',
              backgroundColor: (isIndexing || !veevaIntegrationEnabled) ? '#ccc' : '#28a745',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: (isIndexing || !veevaIntegrationEnabled) ? 'not-allowed' : 'pointer',
              fontSize:'12px'
            }}
            title={!veevaIntegrationEnabled ? 'Veeva integration is disabled' : ''}
          >
            {isIndexing ? 'Indexing...' : 'Index Documents'}
          </button>
          <button
            type="button"
            onClick={() => handleIndexDocuments(true)}
            disabled={isIndexing || !veevaIntegrationEnabled}
            style={{
              padding:'6px 12px',
              backgroundColor: (isIndexing || !veevaIntegrationEnabled) ? '#ccc' : '#ff6b35',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: (isIndexing || !veevaIntegrationEnabled) ? 'not-allowed' : 'pointer',
              fontSize:'12px'
            }}
            title={!veevaIntegrationEnabled ? 'Veeva integration is disabled' : ''}
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
      ) : activeTab === "veeva-documents" ? (
        <VeevaDocumentList />
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
      ) : activeTab === "course-authoring" ? (
        <CourseAuthoring />
      ) : activeTab === "educational-analytics" ? (
        <EducationalAnalytics />
      ) : activeTab === "users" ? (
        <UserManagement />
      ) : activeTab === "settings" ? (
        <div style={{ padding: '20px' }}>
          <h2 style={{
            margin: '0 0 20px 0',
            color: '#374151',
            fontSize: '18px',
            fontWeight: '600',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
          }}>
            System Settings
          </h2>

          {settingsError && (
            <div style={{
              backgroundColor: '#f8d7da',
              color: '#721c24',
              padding: '12px',
              borderRadius: '6px',
              marginBottom: '16px',
              border: '1px solid #f5c6cb',
              fontSize: '14px'
            }}>
              Error: {settingsError}
            </div>
          )}

          <div style={{
            backgroundColor: '#f8f9fa',
            border: '1px solid #e9ecef',
            borderRadius: '6px',
            padding: '20px',
            marginBottom: '16px'
          }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '12px'
            }}>
              <div>
                <h3 style={{
                  margin: '0 0 4px 0',
                  color: '#374151',
                  fontSize: '16px',
                  fontWeight: '600',
                  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                }}>
                  Veeva Vault Integration
                </h3>
                <p style={{
                  margin: 0,
                  color: '#6b7280',
                  fontSize: '14px',
                  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                }}>
                  Enable or disable integration with Veeva Vault. When disabled, Veeva-related features will be hidden.
                </p>
              </div>
              <label style={{
                position: 'relative',
                display: 'inline-block',
                width: '60px',
                height: '34px',
                cursor: isLoadingSettings ? 'not-allowed' : 'pointer'
              }}>
                <input
                  type="checkbox"
                  checked={veevaIntegrationEnabled}
                  onChange={(e) => handleToggleVeevaIntegration(e.target.checked)}
                  disabled={isLoadingSettings}
                  style={{ opacity: 0, width: 0, height: 0 }}
                />
                <span style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  backgroundColor: veevaIntegrationEnabled ? '#28a745' : '#ccc',
                  borderRadius: '34px',
                  transition: 'background-color 0.3s',
                  opacity: isLoadingSettings ? 0.6 : 1
                }}>
                  <span style={{
                    position: 'absolute',
                    content: '""',
                    height: '26px',
                    width: '26px',
                    left: veevaIntegrationEnabled ? '34px' : '4px',
                    bottom: '4px',
                    backgroundColor: 'white',
                    borderRadius: '50%',
                    transition: 'left 0.3s',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                  }} />
                </span>
              </label>
            </div>
            <div style={{
              marginTop: '12px',
              padding: '12px',
              backgroundColor: '#ffffff',
              borderRadius: '4px',
              border: '1px solid #dee2e6'
            }}>
              <p style={{
                margin: 0,
                fontSize: '13px',
                color: '#495057',
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
              }}>
                <strong>Current Status:</strong> {veevaIntegrationEnabled ? (
                  <span style={{ color: '#28a745', fontWeight: '600' }}>Enabled</span>
                ) : (
                  <span style={{ color: '#dc3545', fontWeight: '600' }}>Disabled</span>
                )}
              </p>
              {isLoadingSettings && (
                <p style={{
                  margin: '8px 0 0 0',
                  fontSize: '12px',
                  color: '#6c757d',
                  fontStyle: 'italic'
                }}>
                  Updating setting...
                </p>
              )}
            </div>
          </div>

          {/* Delete Veeva Data Section */}
          <div style={{
            backgroundColor: '#fff3cd',
            border: '1px solid #ffc107',
            borderRadius: '6px',
            padding: '20px',
            marginTop: '20px'
          }}>
            <div style={{
              marginBottom: '12px'
            }}>
              <h3 style={{
                margin: '0 0 4px 0',
                color: '#856404',
                fontSize: '16px',
                fontWeight: '600',
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
              }}>
                Delete All Veeva Data
              </h3>
              <p style={{
                margin: 0,
                color: '#856404',
                fontSize: '14px',
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
              }}>
                Permanently remove all Veeva documents and chunks from the database. This action cannot be undone.
              </p>
            </div>
            
            {deleteError && (
              <div style={{
                backgroundColor: '#f8d7da',
                color: '#721c24',
                padding: '12px',
                borderRadius: '4px',
                marginBottom: '12px',
                border: '1px solid #f5c6cb',
                fontSize: '14px'
              }}>
                Error: {deleteError}
              </div>
            )}

            <button
              onClick={() => setShowDeleteConfirm(true)}
              disabled={isDeletingVeevaData}
              style={{
                padding: '10px 20px',
                backgroundColor: isDeletingVeevaData ? '#ccc' : '#dc3545',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: isDeletingVeevaData ? 'not-allowed' : 'pointer',
                fontSize: '14px',
                fontWeight: '500',
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                transition: 'background-color 0.2s ease'
              }}
              onMouseEnter={(e) => {
                if (!isDeletingVeevaData) {
                  e.target.style.backgroundColor = '#c82333';
                }
              }}
              onMouseLeave={(e) => {
                if (!isDeletingVeevaData) {
                  e.target.style.backgroundColor = '#dc3545';
                }
              }}
            >
              {isDeletingVeevaData ? 'Deleting...' : 'Delete All Veeva Data'}
            </button>
          </div>

          {/* Confirmation Dialog */}
          {showDeleteConfirm && (
            <div style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.5)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 1000
            }}>
              <div style={{
                backgroundColor: 'white',
                borderRadius: '8px',
                padding: '24px',
                maxWidth: '500px',
                width: '90%',
                boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)'
              }}>
                <h3 style={{
                  margin: '0 0 16px 0',
                  color: '#dc3545',
                  fontSize: '18px',
                  fontWeight: '600',
                  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                }}>
                  Confirm Deletion
                </h3>
                <p style={{
                  margin: '0 0 24px 0',
                  color: '#495057',
                  fontSize: '14px',
                  lineHeight: '1.5',
                  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                }}>
                  Are you sure you want to permanently delete all Veeva documents and chunks from the database? This action cannot be undone.
                </p>
                <div style={{
                  display: 'flex',
                  gap: '12px',
                  justifyContent: 'flex-end'
                }}>
                  <button
                    onClick={() => {
                      setShowDeleteConfirm(false);
                      setDeleteError(null);
                    }}
                    disabled={isDeletingVeevaData}
                    style={{
                      padding: '8px 16px',
                      backgroundColor: '#6c757d',
                      color: 'white',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: isDeletingVeevaData ? 'not-allowed' : 'pointer',
                      fontSize: '14px',
                      fontWeight: '500',
                      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleDeleteVeevaData}
                    disabled={isDeletingVeevaData}
                    style={{
                      padding: '8px 16px',
                      backgroundColor: isDeletingVeevaData ? '#ccc' : '#dc3545',
                      color: 'white',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: isDeletingVeevaData ? 'not-allowed' : 'pointer',
                      fontSize: '14px',
                      fontWeight: '500',
                      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                    }}
                  >
                    {isDeletingVeevaData ? 'Deleting...' : 'Yes, Delete All Data'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : null}
      </div>
    </div>
  );
}
