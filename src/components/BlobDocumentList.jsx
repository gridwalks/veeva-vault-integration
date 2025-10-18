import { useState, useEffect } from "react";
import { getBlobDocuments, deleteDocument, downloadUploadedDocumentUrl } from "../api";
import DocumentViewer from "./DocumentViewer.jsx";

export default function BlobDocumentList({ userId, onDocumentDeleted }) {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [pagination, setPagination] = useState({
    total: 0,
    pageOffset: 0,
    pageSize: 50
  });
  const [viewerOpen, setViewerOpen] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState(null);
  const [deletingDoc, setDeletingDoc] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [deleteError, setDeleteError] = useState(null);

  const loadDocuments = async (offset = 0, search = "") => {
    if (!userId) return;
    
    setLoading(true);
    setError(null);
    
    try {
      console.log('Loading blob documents...', { userId, offset, search });
      const result = await getBlobDocuments({
        userId,
        limit: pagination.pageSize,
        offset,
        search
      });
      
      console.log('Blob documents loaded successfully:', {
        total: result.total,
        items: result.items?.length || 0
      });
      
      setDocuments(result.items || []);
      setPagination(prev => ({
        ...prev,
        total: result.total,
        pageOffset: offset
      }));
    } catch (err) {
      console.error('Error loading blob documents:', err);
      setError(err.message);
      setDocuments([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDocuments(0, searchQuery);
  }, [userId]);

  const handleSearch = (e) => {
    e.preventDefault();
    loadDocuments(0, searchQuery);
  };

  const handleViewDocument = (doc) => {
    // For blob storage, we can either use the blob key directly or the download API
    let url;
    if (doc.blob_metadata && doc.blob_metadata.key) {
      // If we have blob metadata, we can construct a direct blob URL
      // or use the download API with the blob key
      url = downloadUploadedDocumentUrl({ documentId: doc.blob_metadata.key });
    } else {
      // Fallback to using the document ID
      url = downloadUploadedDocumentUrl({ documentId: doc.id });
    }
    
    setSelectedDocument({
      url: url,
      name: doc.document_name || doc.original_filename
    });
    setViewerOpen(true);
  };

  const handleCloseViewer = () => {
    setViewerOpen(false);
    setSelectedDocument(null);
  };

  const handleDeleteDocument = async (doc) => {
    setDeletingDoc(doc.id);
    setDeleteError(null);
    
    try {
      console.log('Deleting blob document...', { documentId: doc.id, blobKey: doc.blob_metadata?.key });
      
      // Use the blob key for deletion
      const blobKey = doc.blob_metadata?.key || doc.id;
      
      // Call the blob-delete API directly
      const response = await fetch('/api/blob-delete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ key: blobKey })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete blob');
      }
      
      console.log('Blob document deleted successfully');
      
      // Refresh the list
      await loadDocuments(pagination.pageOffset, searchQuery);
      
      // Notify parent component
      if (onDocumentDeleted) {
        onDocumentDeleted(doc.id);
      }
      
      setDeleteConfirm(null);
    } catch (err) {
      console.error('Error deleting blob document:', err);
      setDeleteError(err.message);
    } finally {
      setDeletingDoc(null);
    }
  };

  const formatFileSize = (bytes) => {
    if (!bytes) return 'Unknown';
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div>
      {/* Search Form */}
      <form onSubmit={handleSearch} style={{ display: 'flex', gap: '6px', marginBottom: '12px' }}>
        <input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search documents by name or content..."
          style={{
            flex: 1,
            padding: '6px 10px',
            border: '1px solid #ddd',
            borderRadius: '4px',
            fontSize: '12px'
          }}
        />
        <button
          type="submit"
          disabled={loading}
          style={{
            padding: '6px 12px',
            backgroundColor: '#007bff',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: loading ? 'not-allowed' : 'pointer',
            fontSize: '12px',
            opacity: loading ? 0.6 : 1
          }}
        >
          {loading ? 'Searching...' : 'Search'}
        </button>
      </form>

      {/* Error Display */}
      {error && (
        <div style={{
          backgroundColor: '#f8d7da',
          color: '#721c24',
          padding: '8px 12px',
          borderRadius: '4px',
          marginBottom: '12px',
          fontSize: '12px'
        }}>
          Error: {error}
        </div>
      )}

      {/* Documents List */}
      {loading && documents.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '20px', color: '#666' }}>
          Loading documents...
        </div>
      ) : documents.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '20px', color: '#666' }}>
          {searchQuery ? 'No documents found matching your search.' : 'No uploaded documents found.'}
        </div>
      ) : (
        <>
          {/* Documents Table */}
          <div style={{
            backgroundColor: '#f8f9fa',
            border: '1px solid #e9ecef',
            borderRadius: '6px',
            overflow: 'hidden'
          }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr style={{ backgroundColor: '#e9ecef' }}>
                  <th style={{ padding: '8px', textAlign: 'left', borderBottom: '1px solid #dee2e6' }}>Document Name</th>
                  <th style={{ padding: '8px', textAlign: 'left', borderBottom: '1px solid #dee2e6' }}>Type</th>
                  <th style={{ padding: '8px', textAlign: 'left', borderBottom: '1px solid #dee2e6' }}>Size</th>
                  <th style={{ padding: '8px', textAlign: 'left', borderBottom: '1px solid #dee2e6' }}>Uploaded</th>
                  <th style={{ padding: '8px', textAlign: 'left', borderBottom: '1px solid #dee2e6' }}>Chunks</th>
                  <th style={{ padding: '8px', textAlign: 'center', borderBottom: '1px solid #dee2e6' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {documents.map((doc) => (
                  <tr key={doc.id} style={{ borderBottom: '1px solid #dee2e6' }}>
                    <td style={{ padding: '8px' }}>
                      <div style={{ fontWeight: '500', color: '#495057' }}>
                        {doc.document_name || doc.original_filename || 'Untitled'}
                      </div>
                      {doc.blob_metadata && (
                        <div style={{ fontSize: '11px', color: '#6c757d', marginTop: '2px' }}>
                          Key: {doc.blob_metadata.key}
                        </div>
                      )}
                      {doc.ai_summary && (
                        <div style={{ fontSize: '11px', color: '#6c757d', marginTop: '2px' }}>
                          {doc.ai_summary.substring(0, 100)}...
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '8px', color: '#495057' }}>
                      {doc.document_type || doc.mime_type || 'Unknown'}
                    </td>
                    <td style={{ padding: '8px', color: '#495057' }}>
                      {formatFileSize(doc.file_size)}
                    </td>
                    <td style={{ padding: '8px', color: '#495057' }}>
                      {formatDate(doc.created_at)}
                    </td>
                    <td style={{ padding: '8px', color: '#495057' }}>
                      {doc.chunk_count || 0}
                    </td>
                    <td style={{ padding: '8px', textAlign: 'center' }}>
                      <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
                        <button
                          onClick={() => handleViewDocument(doc)}
                          style={{
                            padding: '4px 8px',
                            backgroundColor: '#007bff',
                            color: 'white',
                            border: 'none',
                            borderRadius: '3px',
                            cursor: 'pointer',
                            fontSize: '11px'
                          }}
                        >
                          View
                        </button>
                        <button
                          onClick={() => setDeleteConfirm(doc)}
                          disabled={deletingDoc === doc.id}
                          style={{
                            padding: '4px 8px',
                            backgroundColor: deletingDoc === doc.id ? '#6c757d' : '#dc3545',
                            color: 'white',
                            border: 'none',
                            borderRadius: '3px',
                            cursor: deletingDoc === doc.id ? 'not-allowed' : 'pointer',
                            fontSize: '11px'
                          }}
                        >
                          {deletingDoc === doc.id ? 'Deleting...' : 'Delete'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '12px', justifyContent: 'center' }}>
            <button
              disabled={pagination.pageOffset <= 0 || loading}
              onClick={() => loadDocuments(Math.max(0, pagination.pageOffset - pagination.pageSize), searchQuery)}
              style={{
                padding: '5px 10px',
                fontSize: '11px',
                borderRadius: '4px',
                cursor: pagination.pageOffset <= 0 || loading ? 'not-allowed' : 'pointer',
                border: '1px solid #ddd',
                backgroundColor: pagination.pageOffset <= 0 || loading ? '#f8f9fa' : '#fff',
                color: pagination.pageOffset <= 0 || loading ? '#6c757d' : '#495057'
              }}
            >
              Previous
            </button>
            <span style={{ fontSize: '11px', color: '#666' }}>
              {pagination.pageOffset + 1}–{pagination.pageOffset + documents.length} of {pagination.total}
            </span>
            <button
              disabled={pagination.pageOffset + pagination.pageSize >= pagination.total || loading}
              onClick={() => loadDocuments(pagination.pageOffset + pagination.pageSize, searchQuery)}
              style={{
                padding: '5px 10px',
                fontSize: '11px',
                borderRadius: '4px',
                cursor: pagination.pageOffset + pagination.pageSize >= pagination.total || loading ? 'not-allowed' : 'pointer',
                border: '1px solid #ddd',
                backgroundColor: pagination.pageOffset + pagination.pageSize >= pagination.total || loading ? '#f8f9fa' : '#fff',
                color: pagination.pageOffset + pagination.pageSize >= pagination.total || loading ? '#6c757d' : '#495057'
              }}
            >
              Next
            </button>
          </div>
        </>
      )}

      {/* Document Viewer Modal */}
      {viewerOpen && selectedDocument && (
        <DocumentViewer
          isOpen={viewerOpen}
          onClose={handleCloseViewer}
          documentUrl={selectedDocument.url}
          documentName={selectedDocument.name}
        />
      )}

      {/* Delete Confirmation Modal */}
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
            padding: '20px',
            borderRadius: '8px',
            maxWidth: '400px',
            width: '90%',
            boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)'
          }}>
            <h3 style={{ margin: '0 0 12px 0', color: '#dc3545', fontSize: '16px' }}>
              Confirm Deletion
            </h3>
            <p style={{ margin: '0 0 16px 0', color: '#495057', fontSize: '14px' }}>
              Are you sure you want to delete "{deleteConfirm.document_name || deleteConfirm.original_filename || 'Untitled'}"?
              This action cannot be undone and will also delete all associated chunks.
            </p>
            {deleteError && (
              <div style={{
                backgroundColor: '#f8d7da',
                color: '#721c24',
                padding: '8px 12px',
                borderRadius: '4px',
                marginBottom: '12px',
                fontSize: '12px'
              }}>
                Error: {deleteError}
              </div>
            )}
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => {
                  setDeleteConfirm(null);
                  setDeleteError(null);
                }}
                disabled={deletingDoc === deleteConfirm.id}
                style={{
                  padding: '6px 12px',
                  backgroundColor: '#6c757d',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: deletingDoc === deleteConfirm.id ? 'not-allowed' : 'pointer',
                  fontSize: '12px'
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeleteDocument(deleteConfirm)}
                disabled={deletingDoc === deleteConfirm.id}
                style={{
                  padding: '6px 12px',
                  backgroundColor: deletingDoc === deleteConfirm.id ? '#6c757d' : '#dc3545',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: deletingDoc === deleteConfirm.id ? 'not-allowed' : 'pointer',
                  fontSize: '12px'
                }}
              >
                {deletingDoc === deleteConfirm.id ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
