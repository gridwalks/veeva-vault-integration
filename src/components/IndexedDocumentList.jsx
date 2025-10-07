import { downloadUrl, updateManualSummary, downloadUploadedDocumentUrl } from "../api";
import { useState } from "react";
import DocumentViewer from "./DocumentViewer.jsx";
import ReactMarkdown from "react-markdown";

export default function IndexedDocumentList({ items = [], onDocumentsSelected }) {
  const [viewerOpen, setViewerOpen] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState(null);
  const [selectedDocs, setSelectedDocs] = useState(new Set());
  const [editingSummary, setEditingSummary] = useState(null);
  const [summaryText, setSummaryText] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  const handleViewDocument = (doc) => {
    let url;
    if (doc.source_type === 'upload' && doc.blob_url) {
      // For uploaded documents, use the blob URL directly
      url = doc.blob_url;
    } else {
      // For Veeva documents, use the download API
      url = downloadUrl({ id: doc.veeva_document_id, major: doc.major_version, minor: doc.minor_version });
    }
    
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
        marginBottom: '16px',
        padding: '12px',
        backgroundColor: '#f8f9fa',
        borderRadius: '8px',
        border: '1px solid #e9ecef'
      }}>
        <div style={{ fontSize: '14px', color: '#666' }}>
          {selectedDocs.size} of {items.length} documents selected
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={handleSelectAll}
            style={{
              padding: '6px 12px',
              backgroundColor: selectedDocs.size === items.length ? '#6c757d' : '#007bff',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '12px'
            }}
          >
            {selectedDocs.size === items.length ? 'Deselect All' : 'Select All'}
          </button>
        </div>
      </div>

      <div style={{display: 'grid', gap: '16px', marginTop: '16px'}}>
        {items.map((doc) => (
          <div key={doc.id} style={{
            border: '2px solid',
            borderColor: selectedDocs.has(doc.id) ? '#007bff' : '#ddd',
            borderRadius: '8px',
            padding: '16px',
            backgroundColor: selectedDocs.has(doc.id) ? '#f0f8ff' : '#f9f9f9',
            transition: 'all 0.2s ease'
          }}>
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px'}}>
              <div style={{flex: 1}}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                  <input
                    type="checkbox"
                    checked={selectedDocs.has(doc.id)}
                    onChange={() => handleSelectDocument(doc.id)}
                    style={{
                      width: '16px',
                      height: '16px',
                      cursor: 'pointer'
                    }}
                  />
                  <h3 style={{margin: '0', fontSize: '16px', fontWeight: '600'}}>
                    {doc.document_name}
                  </h3>
                </div>
                <div style={{display: 'flex', gap: '16px', fontSize: '14px', color: '#666', marginBottom: '8px', flexWrap: 'wrap', alignItems: 'center'}}>
                  <span><strong>Number:</strong> {doc.document_number || 'N/A'}</span>
                  <span><strong>Version:</strong> {doc.major_version}.{doc.minor_version}</span>
                  <span><strong>Type:</strong> {doc.document_type}</span>
                  <span><strong>Status:</strong> {doc.status}</span>
                  {doc.source_type === 'upload' && (
                    <span style={{
                      backgroundColor: '#17a2b8',
                      color: 'white',
                      padding: '2px 6px',
                      borderRadius: '12px',
                      fontSize: '10px',
                      fontWeight: '600'
                    }}>
                      UPLOADED
                    </span>
                  )}
                </div>
                {doc.original_filename && doc.original_filename !== doc.document_name && (
                  <div style={{ fontSize: '12px', color: '#888', marginBottom: '8px' }}>
                    <strong>Original filename:</strong> {doc.original_filename}
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <button
                  onClick={() => handleViewDocument(doc)}
                  style={{
                    padding: '8px 12px',
                    backgroundColor: '#007bff',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '14px'
                  }}
                >
                  View
                </button>
                {doc.source_type === 'upload' ? (
                  <a
                    href={downloadUploadedDocumentUrl({ documentId: doc.id })}
                    style={{
                      padding: '8px 12px',
                      backgroundColor: '#28a745',
                      color: 'white',
                      textDecoration: 'none',
                      borderRadius: '4px',
                      fontSize: '14px'
                    }}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Download
                  </a>
                ) : (
                  <a
                    href={downloadUrl({ id: doc.veeva_document_id, major: doc.major_version, minor: doc.minor_version })}
                    style={{
                      padding: '8px 12px',
                      backgroundColor: '#28a745',
                      color: 'white',
                      textDecoration: 'none',
                      borderRadius: '4px',
                      fontSize: '14px'
                    }}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Download
                  </a>
                )}
              </div>
            </div>
          
          {/* AI Summary */}
          {doc.summary && (
            <div style={{
              backgroundColor: 'white',
              padding: '12px',
              borderRadius: '4px',
              border: '1px solid #e0e0e0',
              marginBottom: '12px'
            }}>
              <h4 style={{margin: '0 0 8px 0', fontSize: '14px', fontWeight: '600', color: '#333'}}>
                AI Summary:
              </h4>
              <div style={{
                fontSize: '14px',
                lineHeight: '1.5',
                color: '#555',
                textAlign: 'left'
              }}>
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
              </div>
            </div>
          )}

          {/* Manual Summary */}
          <div style={{
            backgroundColor: '#f8f9fa',
            padding: '12px',
            borderRadius: '4px',
            border: '1px solid #dee2e6'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <h4 style={{margin: '0', fontSize: '14px', fontWeight: '600', color: '#333'}}>
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
          
          <div style={{fontSize: '12px', color: '#999', marginTop: '12px'}}>
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
    </>
  );
}
