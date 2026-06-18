import { updateManualSummary, downloadUploadedDocumentUrl, deleteDocument, regenerateDocumentSummary, acceptRegeneratedSummary } from "../api";
import { useState } from "react";
import DocumentViewer from "./DocumentViewer.jsx";
import ReactMarkdown from "react-markdown";

export default function IndexedDocumentList({ items = [], onDocumentsSelected, onDocumentDeleted, onSummaryUpdated }) {
  const [viewerOpen, setViewerOpen] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState(null);
  const [selectedDocs, setSelectedDocs] = useState(new Set());
  const [editingSummary, setEditingSummary] = useState(null);
  const [summaryText, setSummaryText] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [deletingDoc, setDeletingDoc] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [deleteError, setDeleteError] = useState(null);
  const [regeneratingDoc, setRegeneratingDoc] = useState(null);
  const [regenerationError, setRegenerationError] = useState(null);
  const [summaryComparison, setSummaryComparison] = useState(null);
  const [acceptingSummary, setAcceptingSummary] = useState(null);

  const handleViewDocument = (doc) => {
    let url;
    url = downloadUploadedDocumentUrl({ documentId: doc.id });
    
    setSelectedDocument({
      url: url,
      name: doc.document_name
    });
    setViewerOpen(true);
  };

  const handleCloseViewer = () => {
    setViewerOpen(false);
    setSelectedDocument(null);
  };

  const handleSelectDocument = (docId) => {
    const newSelected = new Set(selectedDocs);
    if (newSelected.has(docId)) {
      newSelected.delete(docId);
    } else {
      newSelected.add(docId);
    }
    setSelectedDocs(newSelected);
    
    // Notify parent component of selected documents
    if (onDocumentsSelected) {
      const selectedDocuments = items.filter(doc => newSelected.has(doc.id));
      onDocumentsSelected(selectedDocuments);
    }
  };

  const handleSelectAll = () => {
    if (selectedDocs.size === items.length) {
      // Deselect all
      setSelectedDocs(new Set());
      if (onDocumentsSelected) {
        onDocumentsSelected([]);
      }
    } else {
      // Select all
      const allIds = new Set(items.map(doc => doc.id));
      setSelectedDocs(allIds);
      if (onDocumentsSelected) {
        onDocumentsSelected(items);
      }
    }
  };

  const handleEditSummary = (doc) => {
    setEditingSummary(doc.id);
    setSummaryText(doc.manual_summary || '');
    setSaveError(null);
  };

  const handleSaveSummary = async (docId) => {
    setIsSaving(true);
    setSaveError(null);
    
    try {
      await updateManualSummary({
        documentId: docId,
        manualSummary: summaryText
      });
      
      // Update the local items to reflect the change
      const updatedItems = items.map(item => 
        item.id === docId 
          ? { ...item, manual_summary: summaryText }
          : item
      );
      
      // You might want to notify the parent component to refresh
      console.log('Manual summary saved successfully');
      
      setEditingSummary(null);
      setSummaryText('');
    } catch (error) {
      console.error('Failed to save manual summary:', error);
      setSaveError(error.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancelEdit = () => {
    setEditingSummary(null);
    setSummaryText('');
    setSaveError(null);
  };

  const handleDeleteDocument = (doc) => {
    setDeleteConfirm({
      id: doc.id,
      name: doc.document_name,
      sourceType: doc.source_type
    });
    setDeleteError(null);
  };

  const handleConfirmDelete = async () => {
    if (!deleteConfirm) return;
    
    setDeletingDoc(deleteConfirm.id);
    setDeleteError(null);
    
    try {
      await deleteDocument({
        documentId: deleteConfirm.id,
        sourceType: deleteConfirm.sourceType
      });
      
      console.log('Document deleted successfully:', deleteConfirm.name);
      
      // Notify parent component to refresh the list
      if (onDocumentDeleted) {
        onDocumentDeleted(deleteConfirm.id);
      }
      
      setDeleteConfirm(null);
    } catch (error) {
      console.error('Failed to delete document:', error);
      setDeleteError(error.message);
    } finally {
      setDeletingDoc(null);
    }
  };

  const handleCancelDelete = () => {
    setDeleteConfirm(null);
    setDeleteError(null);
  };

  const handleRegenerateSummary = async (doc) => {
    setRegeneratingDoc(doc.id);
    setRegenerationError(null);
    setSummaryComparison(null);
    
    try {
      console.log(`Regenerating summary for document: ${doc.document_name}`, {
        documentId: doc.id,
        sourceType: doc.source_type,
        hasId: !!doc.id,
        hasBlobUrl: !!doc.blob_url
      });
      
      const result = await regenerateDocumentSummary({
        documentId: doc.id,
        sourceType: 'upload'
      });
      
      console.log('Summary regeneration completed:', result);
      
      // Set up comparison view
      setSummaryComparison({
        documentId: doc.id,
        documentName: doc.document_name,
        oldSummary: result.oldSummary,
        newSummary: result.newSummary,
        chunksRegenerated: result.chunksRegenerated,
        chunkCount: result.chunkCount
      });
      
    } catch (error) {
      console.error('Failed to regenerate summary:', error);
      setRegenerationError(error.message);
    } finally {
      setRegeneratingDoc(null);
    }
  };

  const handleAcceptNewSummary = async () => {
    if (!summaryComparison) return;
    
    setAcceptingSummary(summaryComparison.documentId);
    
    try {
      console.log(`Accepting new summary for document: ${summaryComparison.documentName}`);
      await acceptRegeneratedSummary({
        documentId: summaryComparison.documentId,
        newSummary: summaryComparison.newSummary
      });
      
      console.log('Summary accepted successfully');
      
      // Clear comparison state
      setSummaryComparison(null);
      
      // Notify parent component to refresh the document list
      if (onSummaryUpdated) {
        onSummaryUpdated(summaryComparison.documentId);
      }
      
    } catch (error) {
      console.error('Failed to accept new summary:', error);
      setRegenerationError(error.message);
    } finally {
      setAcceptingSummary(null);
    }
  };

  const handleKeepOldSummary = () => {
    setSummaryComparison(null);
    setRegenerationError(null);
  };

  if (!items?.length) {
    return <p style={{color: '#666', fontStyle: 'italic'}}>No indexed documents found.</p>;
  }

  return (
    <>
      {/* Selection Controls */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '12px',
        padding: '8px',
        backgroundColor: '#f8f9fa',
        borderRadius: '6px',
        border: '1px solid #e9ecef'
      }}>
        <div style={{ fontSize: '12px', color: '#666' }}>
          {selectedDocs.size} of {items.length} documents selected
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={handleSelectAll}
            style={{
              padding: '5px 10px',
              backgroundColor: selectedDocs.size === items.length ? '#6c757d' : '#007bff',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '11px'
            }}
          >
            {selectedDocs.size === items.length ? 'Deselect All' : 'Select All'}
          </button>
        </div>
      </div>

      <div style={{display: 'grid', gap: '12px', marginTop: '12px'}}>
        {items.map((doc) => (
          <div key={doc.id} style={{
            border: '2px solid',
            borderColor: selectedDocs.has(doc.id) ? '#007bff' : '#ddd',
            borderRadius: '6px',
            padding: '12px',
            backgroundColor: selectedDocs.has(doc.id) ? '#f0f8ff' : '#f9f9f9',
            transition: 'all 0.2s ease'
          }}>
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px'}}>
              <div style={{flex: 1}}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                  <input
                    type="checkbox"
                    checked={selectedDocs.has(doc.id)}
                    onChange={() => handleSelectDocument(doc.id)}
                    style={{
                      width: '14px',
                      height: '14px',
                      cursor: 'pointer'
                    }}
                  />
                  <h3 style={{margin: '0', fontSize: '13px', fontWeight: '600'}}>
                    {doc.document_name}
                  </h3>
                </div>
                <div style={{display: 'flex', gap: '12px', fontSize: '11px', color: '#666', marginBottom: '6px', flexWrap: 'wrap', alignItems: 'center'}}>
                  <span><strong>Number:</strong> {doc.document_number || 'N/A'}</span>
                  <span><strong>Version:</strong> {doc.major_version}.{doc.minor_version}</span>
                  <span><strong>Type:</strong> {doc.document_type}</span>
                  <span><strong>Status:</strong> {doc.status}</span>
                  {doc.source_type === 'upload' && (
                    <span style={{
                      backgroundColor: '#17a2b8',
                      color: 'white',
                      padding: '2px 5px',
                      borderRadius: '10px',
                      fontSize: '9px',
                      fontWeight: '600'
                    }}>
                      UPLOADED
                    </span>
                  )}
                </div>
                {doc.original_filename && doc.original_filename !== doc.document_name && (
                  <div style={{ fontSize: '10px', color: '#888', marginBottom: '6px' }}>
                    <strong>Original filename:</strong> {doc.original_filename}
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                <button
                  onClick={() => handleViewDocument(doc)}
                  style={{
                    padding: '6px 10px',
                    backgroundColor: '#007bff',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '11px'
                  }}
                >
                  View
                </button>
                  <a
                    href={downloadUploadedDocumentUrl({ documentId: doc.id })}
                    style={{
                      padding: '6px 10px',
                      backgroundColor: '#28a745',
                      color: 'white',
                      textDecoration: 'none',
                      borderRadius: '4px',
                      fontSize: '11px'
                    }}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Download
                  </a>
                <button
                  onClick={() => handleDeleteDocument(doc)}
                  disabled={deletingDoc === doc.id}
                  style={{
                    padding: '6px 10px',
                    backgroundColor: deletingDoc === doc.id ? '#ccc' : '#dc3545',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: deletingDoc === doc.id ? 'not-allowed' : 'pointer',
                    fontSize: '11px'
                  }}
                >
                  {deletingDoc === doc.id ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            </div>
          
          {/* AI Summary */}
          <div style={{
            backgroundColor: 'white',
            padding: '8px',
            borderRadius: '4px',
            border: '1px solid #e0e0e0',
            marginBottom: '8px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <h4 style={{margin: '0', fontSize: '12px', fontWeight: '600', color: '#333'}}>
                AI Summary:
              </h4>
              <button
                onClick={() => handleRegenerateSummary(doc)}
                disabled={regeneratingDoc === doc.id}
                style={{
                  padding: '4px 8px',
                  backgroundColor: regeneratingDoc === doc.id ? '#ccc' : '#17a2b8',
                  color: 'white',
                  border: 'none',
                  borderRadius: '3px',
                  cursor: regeneratingDoc === doc.id ? 'not-allowed' : 'pointer',
                  fontSize: '11px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
              >
                {regeneratingDoc === doc.id ? (
                  <>
                    <span>🔄</span>
                    <span>Regenerating...</span>
                  </>
                ) : (
                  <>
                    <span>🔄</span>
                    <span>Regenerate</span>
                  </>
                )}
              </button>
            </div>
            <div style={{
              fontSize: '12px',
              lineHeight: '1.4',
              color: '#555',
              textAlign: 'left'
            }}>
              {doc.summary ? (
                <ReactMarkdown
                  components={{
                    h1: ({children}) => <h1 style={{fontSize: '16px', fontWeight: 'bold', margin: '8px 0 4px 0', color: '#333'}}>{children}</h1>,
                    h2: ({children}) => <h2 style={{fontSize: '15px', fontWeight: 'bold', margin: '6px 0 4px 0', color: '#333'}}>{children}</h2>,
                    h3: ({children}) => <h3 style={{fontSize: '14px', fontWeight: 'bold', margin: '4px 0 2px 0', color: '#333'}}>{children}</h3>,
                    strong: ({children}) => <strong style={{fontWeight: 'bold', color: '#333'}}>{children}</strong>,
                    em: ({children}) => <em style={{fontStyle: 'italic'}}>{children}</em>,
                    code: ({children}) => <code style={{backgroundColor: '#f4f4f4', padding: '2px 4px', borderRadius: '3px', fontFamily: 'monospace', fontSize: '13px'}}>{children}</code>,
                    pre: ({children}) => <pre style={{backgroundColor: '#f4f4f4', padding: '8px', borderRadius: '4px', overflow: 'auto', fontSize: '13px', fontFamily: 'monospace'}}>{children}</pre>,
                    p: ({children}) => <p style={{margin: '4px 0'}}>{children}</p>,
                    ul: ({children}) => <ul style={{margin: '4px 0', paddingLeft: '20px'}}>{children}</ul>,
                    ol: ({children}) => <ol style={{margin: '4px 0', paddingLeft: '20px'}}>{children}</ol>,
                    li: ({children}) => <li style={{margin: '2px 0'}}>{children}</li>,
                    a: ({href, children}) => <a href={href} style={{color: '#007bff', textDecoration: 'underline'}} target="_blank" rel="noopener noreferrer">{children}</a>
                  }}
                >
                  {doc.summary}
                </ReactMarkdown>
              ) : (
                <div style={{
                  color: '#999',
                  fontStyle: 'italic',
                  textAlign: 'center',
                  padding: '20px'
                }}>
                  No AI summary available. Click "Regenerate" to generate one.
                </div>
              )}
            </div>
          </div>

          {/* Summary Comparison View */}
          {summaryComparison && summaryComparison.documentId === doc.id && (
            <div style={{
              backgroundColor: '#f8f9fa',
              padding: '12px',
              borderRadius: '6px',
              border: '2px solid #17a2b8',
              marginBottom: '8px'
            }}>
              <h4 style={{margin: '0 0 12px 0', fontSize: '13px', fontWeight: '600', color: '#17a2b8'}}>
                📊 Summary Comparison - {summaryComparison.documentName}
              </h4>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                {/* Old Summary */}
                <div style={{
                  backgroundColor: 'white',
                  padding: '8px',
                  borderRadius: '4px',
                  border: '1px solid #dee2e6'
                }}>
                  <h5 style={{margin: '0 0 6px 0', fontSize: '11px', fontWeight: '600', color: '#6c757d'}}>
                    Current Summary:
                  </h5>
                  <div style={{
                    fontSize: '11px',
                    lineHeight: '1.4',
                    color: '#555',
                    maxHeight: '200px',
                    overflowY: 'auto'
                  }}>
                    <ReactMarkdown
                      components={{
                        p: ({children}) => <p style={{margin: '2px 0', fontSize: '11px'}}>{children}</p>,
                        strong: ({children}) => <strong style={{fontWeight: 'bold'}}>{children}</strong>,
                        em: ({children}) => <em style={{fontStyle: 'italic'}}>{children}</em>,
                        ul: ({children}) => <ul style={{margin: '2px 0', paddingLeft: '16px', fontSize: '11px'}}>{children}</ul>,
                        ol: ({children}) => <ol style={{margin: '2px 0', paddingLeft: '16px', fontSize: '11px'}}>{children}</ol>,
                        li: ({children}) => <li style={{margin: '1px 0', fontSize: '11px'}}>{children}</li>
                      }}
                    >
                      {summaryComparison.oldSummary || 'No current summary'}
                    </ReactMarkdown>
                  </div>
                </div>

                {/* New Summary */}
                <div style={{
                  backgroundColor: 'white',
                  padding: '8px',
                  borderRadius: '4px',
                  border: '1px solid #28a745'
                }}>
                  <h5 style={{margin: '0 0 6px 0', fontSize: '11px', fontWeight: '600', color: '#28a745'}}>
                    New Summary:
                  </h5>
                  <div style={{
                    fontSize: '11px',
                    lineHeight: '1.4',
                    color: '#555',
                    maxHeight: '200px',
                    overflowY: 'auto'
                  }}>
                    <ReactMarkdown
                      components={{
                        p: ({children}) => <p style={{margin: '2px 0', fontSize: '11px'}}>{children}</p>,
                        strong: ({children}) => <strong style={{fontWeight: 'bold'}}>{children}</strong>,
                        em: ({children}) => <em style={{fontStyle: 'italic'}}>{children}</em>,
                        ul: ({children}) => <ul style={{margin: '2px 0', paddingLeft: '16px', fontSize: '11px'}}>{children}</ul>,
                        ol: ({children}) => <ol style={{margin: '2px 0', paddingLeft: '16px', fontSize: '11px'}}>{children}</ol>,
                        li: ({children}) => <li style={{margin: '1px 0', fontSize: '11px'}}>{children}</li>
                      }}
                    >
                      {summaryComparison.newSummary}
                    </ReactMarkdown>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                <button
                  onClick={handleAcceptNewSummary}
                  disabled={acceptingSummary === summaryComparison.documentId}
                  style={{
                    padding: '6px 12px',
                    backgroundColor: acceptingSummary === summaryComparison.documentId ? '#ccc' : '#28a745',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: acceptingSummary === summaryComparison.documentId ? 'not-allowed' : 'pointer',
                    fontSize: '12px',
                    fontWeight: '600'
                  }}
                >
                  {acceptingSummary === summaryComparison.documentId ? 'Accepting...' : '✅ Accept New Summary'}
                </button>
                <button
                  onClick={handleKeepOldSummary}
                  style={{
                    padding: '6px 12px',
                    backgroundColor: '#6c757d',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '12px',
                    fontWeight: '600'
                  }}
                >
                  ❌ Keep Current Summary
                </button>
              </div>

              {/* Additional Info */}
              {summaryComparison.chunksRegenerated && (
                <div style={{
                  marginTop: '8px',
                  padding: '6px',
                  backgroundColor: '#d1ecf1',
                  borderRadius: '4px',
                  fontSize: '10px',
                  color: '#0c5460',
                  textAlign: 'center'
                }}>
                  ℹ️ Document chunks were also regenerated ({summaryComparison.chunkCount} chunks)
                </div>
              )}
            </div>
          )}

          {/* Regeneration Error */}
          {regenerationError && regeneratingDoc === doc.id && (
            <div style={{
              backgroundColor: '#f8d7da',
              color: '#721c24',
              padding: '8px',
              borderRadius: '4px',
              marginBottom: '8px',
              fontSize: '12px'
            }}>
              ❌ Error regenerating summary: {regenerationError}
            </div>
          )}

          {/* Manual Summary */}
          <div style={{
            backgroundColor: '#f8f9fa',
            padding: '8px',
            borderRadius: '4px',
            border: '1px solid #dee2e6'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <h4 style={{margin: '0', fontSize: '12px', fontWeight: '600', color: '#333'}}>
                Manual Summary:
              </h4>
              {editingSummary !== doc.id && (
                <button
                  onClick={() => handleEditSummary(doc)}
                  style={{
                    padding: '4px 8px',
                    backgroundColor: '#6c757d',
                    color: 'white',
                    border: 'none',
                    borderRadius: '3px',
                    cursor: 'pointer',
                    fontSize: '12px'
                  }}
                >
                  {doc.manual_summary ? 'Edit' : 'Add Summary'}
                </button>
              )}
            </div>
            
            {editingSummary === doc.id ? (
              <div>
                <textarea
                  value={summaryText}
                  onChange={(e) => setSummaryText(e.target.value)}
                  placeholder="Enter your manual summary of this document..."
                  style={{
                    width: '100%',
                    minHeight: '80px',
                    padding: '8px',
                    border: '1px solid #ced4da',
                    borderRadius: '4px',
                    fontSize: '14px',
                    fontFamily: 'inherit',
                    resize: 'vertical'
                  }}
                />
                {saveError && (
                  <div style={{ color: '#dc3545', fontSize: '12px', marginTop: '4px' }}>
                    Error: {saveError}
                  </div>
                )}
                <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                  <button
                    onClick={() => handleSaveSummary(doc.id)}
                    disabled={isSaving}
                    style={{
                      padding: '6px 12px',
                      backgroundColor: isSaving ? '#ccc' : '#28a745',
                      color: 'white',
                      border: 'none',
                      borderRadius: '3px',
                      cursor: isSaving ? 'not-allowed' : 'pointer',
                      fontSize: '12px'
                    }}
                  >
                    {isSaving ? 'Saving...' : 'Save'}
                  </button>
                  <button
                    onClick={handleCancelEdit}
                    disabled={isSaving}
                    style={{
                      padding: '6px 12px',
                      backgroundColor: '#6c757d',
                      color: 'white',
                      border: 'none',
                      borderRadius: '3px',
                      cursor: isSaving ? 'not-allowed' : 'pointer',
                      fontSize: '12px'
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div style={{
                fontSize: '14px',
                lineHeight: '1.5',
                color: '#555',
                textAlign: 'left',
                minHeight: '40px',
                padding: '8px',
                backgroundColor: 'white',
                borderRadius: '3px',
                border: '1px solid #e9ecef'
              }}>
                {doc.manual_summary ? (
                  <ReactMarkdown
                    components={{
                      p: ({children}) => <p style={{margin: '4px 0'}}>{children}</p>,
                      strong: ({children}) => <strong style={{fontWeight: 'bold'}}>{children}</strong>,
                      em: ({children}) => <em style={{fontStyle: 'italic'}}>{children}</em>,
                      ul: ({children}) => <ul style={{margin: '4px 0', paddingLeft: '20px'}}>{children}</ul>,
                      ol: ({children}) => <ol style={{margin: '4px 0', paddingLeft: '20px'}}>{children}</ol>,
                      li: ({children}) => <li style={{margin: '2px 0'}}>{children}</li>
                    }}
                  >
                    {doc.manual_summary}
                  </ReactMarkdown>
                ) : (
                  <span style={{ color: '#999', fontStyle: 'italic' }}>
                    No manual summary added yet. Click "Add Summary" to add your own notes about this document.
                  </span>
                )}
              </div>
            )}
          </div>
          
          <div style={{fontSize: '10px', color: '#999', marginTop: '8px'}}>
            Indexed: {new Date(doc.indexed_at).toLocaleString()} | 
            Updated: {new Date(doc.updated_at).toLocaleString()}
          </div>
        </div>
      ))}
      </div>

      <DocumentViewer
        isOpen={viewerOpen}
        onClose={handleCloseViewer}
        documentUrl={selectedDocument?.url}
        documentName={selectedDocument?.name}
      />

      {/* Delete Confirmation Dialog */}
      {deleteConfirm && (
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
            padding: '24px',
            borderRadius: '8px',
            maxWidth: '400px',
            width: '90%',
            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)'
          }}>
            <h3 style={{ margin: '0 0 16px 0', color: '#dc3545', fontSize: '18px' }}>
              Confirm Delete
            </h3>
            <p style={{ margin: '0 0 16px 0', color: '#333', lineHeight: '1.5' }}>
              Are you sure you want to delete <strong>"{deleteConfirm.name}"</strong> from the index?
              <br />
              <span style={{ fontSize: '14px', color: '#666' }}>
                This will also delete all associated chunks and embeddings. This action cannot be undone.
              </span>
            </p>
            {deleteError && (
              <div style={{
                backgroundColor: '#f8d7da',
                color: '#721c24',
                padding: '8px 12px',
                borderRadius: '4px',
                marginBottom: '16px',
                fontSize: '14px'
              }}>
                Error: {deleteError}
              </div>
            )}
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                onClick={handleCancelDelete}
                disabled={deletingDoc === deleteConfirm.id}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#6c757d',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: deletingDoc === deleteConfirm.id ? 'not-allowed' : 'pointer',
                  fontSize: '14px'
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDelete}
                disabled={deletingDoc === deleteConfirm.id}
                style={{
                  padding: '8px 16px',
                  backgroundColor: deletingDoc === deleteConfirm.id ? '#ccc' : '#dc3545',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: deletingDoc === deleteConfirm.id ? 'not-allowed' : 'pointer',
                  fontSize: '14px'
                }}
              >
                {deletingDoc === deleteConfirm.id ? 'Deleting...' : 'Delete Document'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
