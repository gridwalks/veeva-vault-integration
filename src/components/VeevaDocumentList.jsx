import { useState, useEffect } from "react";
import { listApproved, downloadUrl } from "../api";
import DocumentViewer from "./DocumentViewer.jsx";

export default function VeevaDocumentList() {
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

  const loadDocuments = async (offset = 0, search = "") => {
    setLoading(true);
    setError(null);
    
    try {
      console.log('Loading Veeva documents...', { search, offset });
      const result = await listApproved({
        name: search,
        limit: pagination.pageSize,
        offset: offset
      });
      
      console.log('Veeva documents loaded successfully:', {
        total: result.total,
        items: result.items?.length || 0
      });
      
      setDocuments(result.items || []);
      setPagination(prev => ({
        ...prev,
        total: result.total || 0,
        pageOffset: result.pageOffset || 0,
        pageSize: result.pageSize || 50
      }));
    } catch (err) {
      console.error('Error loading Veeva documents:', err);
      setError(err.message);
      setDocuments([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDocuments(0, searchQuery);
  }, []);

  const handleSearch = (e) => {
    e.preventDefault();
    loadDocuments(0, searchQuery);
  };

  const handleViewDocument = (doc) => {
    setSelectedDocument({
      url: downloadUrl({ id: doc.id, major: doc.major, minor: doc.minor }),
      name: doc.name
    });
    setViewerOpen(true);
  };

  const handleCloseViewer = () => {
    setViewerOpen(false);
    setSelectedDocument(null);
  };

  return (
    <>
      {/* Search Form */}
      <form onSubmit={handleSearch} style={{
        display: 'flex',
        gap: '8px',
        marginBottom: '16px',
        alignItems: 'center'
      }}>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search by document name or number..."
          style={{
            flex: 1,
            padding: '8px 12px',
            border: '1px solid #ddd',
            borderRadius: '6px',
            fontSize: '14px',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
          }}
        />
        <button
          type="submit"
          disabled={loading}
          style={{
            padding: '8px 16px',
            backgroundColor: loading ? '#ccc' : '#007bff',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: loading ? 'not-allowed' : 'pointer',
            fontSize: '14px',
            fontWeight: '500',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
          }}
        >
          {loading ? 'Searching...' : 'Search'}
        </button>
        <button
          type="button"
          onClick={() => {
            setSearchQuery("");
            loadDocuments(0, "");
          }}
          disabled={loading}
          style={{
            padding: '8px 16px',
            backgroundColor: loading ? '#ccc' : '#6c757d',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: loading ? 'not-allowed' : 'pointer',
            fontSize: '14px',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
          }}
        >
          Clear
        </button>
      </form>

      {/* Error Message */}
      {error && (
        <div style={{
          backgroundColor: '#f8d7da',
          color: '#721c24',
          padding: '12px',
          borderRadius: '6px',
          marginBottom: '16px',
          border: '1px solid #f5c6cb',
          fontSize: '14px'
        }}>
          Error: {error}
        </div>
      )}

      {/* Total Count Display */}
      {!loading && !error && (
        <div style={{
          backgroundColor: '#f8f9fa',
          border: '1px solid #e9ecef',
          borderRadius: '6px',
          padding: '12px',
          marginBottom: '16px',
          textAlign: 'center'
        }}>
          <div style={{
            fontSize: '14px',
            fontWeight: '600',
            color: '#495057',
            marginBottom: '4px'
          }}>
            Available Documents in Veeva
          </div>
          <div style={{
            fontSize: '24px',
            fontWeight: '700',
            color: '#007bff'
          }}>
            {pagination.total || 0}
          </div>
          <div style={{
            fontSize: '12px',
            color: '#6c757d',
            marginTop: '4px'
          }}>
            (Matching indexing criteria: Effective status, SOP/Work Instruction/Policy subtypes)
          </div>
        </div>
      )}

      {/* Documents List */}
      {loading && documents.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>
          <div style={{
            width: '40px',
            height: '40px',
            border: '4px solid #e5e7eb',
            borderTop: '4px solid #007bff',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
            margin: '0 auto 16px'
          }} />
          <p>Loading documents from Veeva...</p>
        </div>
      ) : documents.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>
          {searchQuery ? 'No documents found matching your search.' : 'No documents found in Veeva matching the indexing criteria.'}
        </div>
      ) : (
        <>
          {/* Documents Table */}
          <div style={{
            backgroundColor: '#f8f9fa',
            border: '1px solid #e9ecef',
            borderRadius: '6px',
            overflow: 'hidden',
            marginBottom: '16px'
          }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr style={{ backgroundColor: '#e9ecef' }}>
                  <th style={{ padding: '10px', textAlign: 'left', borderBottom: '2px solid #dee2e6', fontWeight: '600' }}>Document Name</th>
                  <th style={{ padding: '10px', textAlign: 'left', borderBottom: '2px solid #dee2e6', fontWeight: '600' }}>Number</th>
                  <th style={{ padding: '10px', textAlign: 'left', borderBottom: '2px solid #dee2e6', fontWeight: '600' }}>Type</th>
                  <th style={{ padding: '10px', textAlign: 'left', borderBottom: '2px solid #dee2e6', fontWeight: '600' }}>Subtype</th>
                  <th style={{ padding: '10px', textAlign: 'left', borderBottom: '2px solid #dee2e6', fontWeight: '600' }}>Version</th>
                  <th style={{ padding: '10px', textAlign: 'left', borderBottom: '2px solid #dee2e6', fontWeight: '600' }}>Status</th>
                  <th style={{ padding: '10px', textAlign: 'center', borderBottom: '2px solid #dee2e6', fontWeight: '600' }}>Indexed</th>
                  <th style={{ padding: '10px', textAlign: 'center', borderBottom: '2px solid #dee2e6', fontWeight: '600' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {documents.map((doc) => (
                  <tr key={doc.id} style={{ 
                    borderBottom: '1px solid #dee2e6',
                    backgroundColor: '#ffffff',
                    transition: 'background-color 0.2s ease'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f8f9fa'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#ffffff'}
                  >
                    <td style={{ padding: '10px', fontWeight: '500', color: '#495057' }}>
                      {doc.name || 'N/A'}
                    </td>
                    <td style={{ padding: '10px', color: '#6c757d', fontSize: '11px' }}>
                      {doc.number || 'N/A'}
                    </td>
                    <td style={{ padding: '10px', color: '#6c757d', fontSize: '11px' }}>
                      {doc.type || 'N/A'}
                    </td>
                    <td style={{ padding: '10px', color: '#6c757d', fontSize: '11px' }}>
                      {doc.subtype || 'N/A'}
                    </td>
                    <td style={{ padding: '10px', color: '#6c757d', fontSize: '11px' }}>
                      v{doc.major || 0}.{doc.minor || 0}
                    </td>
                    <td style={{ padding: '10px' }}>
                      <span style={{
                        backgroundColor: '#d4edda',
                        color: '#155724',
                        padding: '4px 8px',
                        borderRadius: '12px',
                        fontSize: '11px',
                        fontWeight: '600'
                      }}>
                        {doc.status || 'N/A'}
                      </span>
                    </td>
                    <td style={{ padding: '10px', textAlign: 'center' }}>
                      {doc.indexed ? (
                        <span style={{
                          backgroundColor: '#d1ecf1',
                          color: '#0c5460',
                          padding: '4px 8px',
                          borderRadius: '12px',
                          fontSize: '11px',
                          fontWeight: '600'
                        }}>
                          ✓ Indexed
                        </span>
                      ) : (
                        <span style={{
                          backgroundColor: '#fff3cd',
                          color: '#856404',
                          padding: '4px 8px',
                          borderRadius: '12px',
                          fontSize: '11px',
                          fontWeight: '600'
                        }}>
                          Not Indexed
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '10px', textAlign: 'center' }}>
                      <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                        <button
                          onClick={() => handleViewDocument(doc)}
                          style={{
                            padding: '6px 12px',
                            backgroundColor: '#007bff',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '11px',
                            fontWeight: '500',
                            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                            transition: 'background-color 0.2s ease'
                          }}
                          onMouseEnter={(e) => e.target.style.backgroundColor = '#0056b3'}
                          onMouseLeave={(e) => e.target.style.backgroundColor = '#007bff'}
                        >
                          View
                        </button>
                        <a
                          href={downloadUrl({ id: doc.id, major: doc.major, minor: doc.minor })}
                          style={{
                            padding: '6px 12px',
                            backgroundColor: '#28a745',
                            color: 'white',
                            textDecoration: 'none',
                            borderRadius: '4px',
                            fontSize: '11px',
                            fontWeight: '500',
                            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                            transition: 'background-color 0.2s ease',
                            display: 'inline-block'
                          }}
                          onMouseEnter={(e) => e.target.style.backgroundColor = '#218838'}
                          onMouseLeave={(e) => e.target.style.backgroundColor = '#28a745'}
                        >
                          Download
                        </a>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div style={{
            display: 'flex',
            gap: '12px',
            alignItems: 'center',
            justifyContent: 'center',
            marginTop: '16px'
          }}>
            <button
              disabled={pagination.pageOffset <= 0 || loading}
              onClick={() => {
                const newOffset = Math.max(0, pagination.pageOffset - pagination.pageSize);
                loadDocuments(newOffset, searchQuery);
              }}
              style={{
                padding: '8px 16px',
                fontSize: '12px',
                borderRadius: '6px',
                cursor: pagination.pageOffset <= 0 || loading ? 'not-allowed' : 'pointer',
                border: '1px solid #ddd',
                backgroundColor: pagination.pageOffset <= 0 || loading ? '#f8f9fa' : '#ffffff',
                color: pagination.pageOffset <= 0 || loading ? '#6c757d' : '#495057',
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
              }}
            >
              Previous
            </button>
            <span style={{
              fontSize: '12px',
              color: '#6c757d',
              fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
            }}>
              Showing {pagination.pageOffset + 1}–{Math.min(pagination.pageOffset + pagination.pageSize, pagination.total)} of {pagination.total}
            </span>
            <button
              disabled={pagination.pageOffset + pagination.pageSize >= pagination.total || loading}
              onClick={() => {
                const newOffset = pagination.pageOffset + pagination.pageSize;
                loadDocuments(newOffset, searchQuery);
              }}
              style={{
                padding: '8px 16px',
                fontSize: '12px',
                borderRadius: '6px',
                cursor: pagination.pageOffset + pagination.pageSize >= pagination.total || loading ? 'not-allowed' : 'pointer',
                border: '1px solid #ddd',
                backgroundColor: pagination.pageOffset + pagination.pageSize >= pagination.total || loading ? '#f8f9fa' : '#ffffff',
                color: pagination.pageOffset + pagination.pageSize >= pagination.total || loading ? '#6c757d' : '#495057',
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
              }}
            >
              Next
            </button>
          </div>
        </>
      )}

      {/* Document Viewer Modal */}
      <DocumentViewer
        isOpen={viewerOpen}
        onClose={handleCloseViewer}
        documentUrl={selectedDocument?.url}
        documentName={selectedDocument?.name}
      />
    </>
  );
}
