import { useState, useEffect } from 'react';
import { getQAInteractions, deleteQAInteraction, exportQAInteractions } from '../api';

export default function QAManagement() {
  const [qaData, setQaData] = useState({ items: [], total: 0, page: 1, totalPages: 0 });
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedItems, setSelectedItems] = useState([]);
  const [isExporting, setIsExporting] = useState(false);

  const loadQAInteractions = async (page = 1, search = '') => {
    setIsLoading(true);
    setError(null);
    
    try {
      const data = await getQAInteractions({ 
        page, 
        limit: 20, 
        search: search || searchQuery 
      });
      setQaData(data);
    } catch (err) {
      console.error('Error loading Q&A interactions:', err);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSearch = (e) => {
    e.preventDefault();
    loadQAInteractions(1, searchQuery);
  };

  const handleDelete = async (id) => {
    if (!confirm('Are you sure you want to delete this Q&A interaction?')) {
      return;
    }

    try {
      await deleteQAInteraction({ id });
      await loadQAInteractions(qaData.page, searchQuery);
      setSelectedItems(prev => prev.filter(item => item !== id));
    } catch (err) {
      console.error('Error deleting Q&A interaction:', err);
      setError(err.message);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedItems.length === 0) return;
    
    if (!confirm(`Are you sure you want to delete ${selectedItems.length} Q&A interaction(s)?`)) {
      return;
    }

    try {
      await Promise.all(selectedItems.map(id => deleteQAInteraction({ id })));
      await loadQAInteractions(qaData.page, searchQuery);
      setSelectedItems([]);
    } catch (err) {
      console.error('Error bulk deleting Q&A interactions:', err);
      setError(err.message);
    }
  };

  const handleExport = async () => {
    setIsExporting(true);
    try {
      await exportQAInteractions({ search: searchQuery });
    } catch (err) {
      console.error('Error exporting Q&A interactions:', err);
      setError(err.message);
    } finally {
      setIsExporting(false);
    }
  };

  const handleSelectAll = () => {
    if (selectedItems.length === qaData.items.length) {
      setSelectedItems([]);
    } else {
      setSelectedItems(qaData.items.map(item => item.id));
    }
  };

  const handleSelectItem = (id) => {
    setSelectedItems(prev => 
      prev.includes(id) 
        ? prev.filter(item => item !== id)
        : [...prev, id]
    );
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString();
  };

  const truncateText = (text, maxLength = 100) => {
    if (!text) return '';
    return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
  };

  useEffect(() => {
    loadQAInteractions();
  }, []);

  return (
    <div style={{ padding: '20px' }}>
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        marginBottom: '20px' 
      }}>
        <h2 style={{ margin: 0, color: '#374151' }}>Q&A Interactions</h2>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={handleExport}
            disabled={isExporting}
            style={{
              padding: '8px 16px',
              backgroundColor: isExporting ? '#ccc' : '#10b981',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: isExporting ? 'not-allowed' : 'pointer',
              fontSize: '14px'
            }}
          >
            {isExporting ? 'Exporting...' : 'Export CSV'}
          </button>
          {selectedItems.length > 0 && (
            <button
              onClick={handleBulkDelete}
              style={{
                padding: '8px 16px',
                backgroundColor: '#ef4444',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '14px'
              }}
            >
              Delete Selected ({selectedItems.length})
            </button>
          )}
        </div>
      </div>

      {/* Search Form */}
      <form onSubmit={handleSearch} style={{ 
        display: 'flex', 
        gap: '10px', 
        marginBottom: '20px',
        alignItems: 'center'
      }}>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search questions and answers..."
          style={{
            flex: 1,
            padding: '8px 12px',
            border: '1px solid #d1d5db',
            borderRadius: '6px',
            fontSize: '14px'
          }}
        />
        <button
          type="submit"
          disabled={isLoading}
          style={{
            padding: '8px 16px',
            backgroundColor: '#3b82f6',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: isLoading ? 'not-allowed' : 'pointer',
            fontSize: '14px'
          }}
        >
          {isLoading ? 'Searching...' : 'Search'}
        </button>
      </form>

      {/* Error Message */}
      {error && (
        <div style={{
          backgroundColor: '#fef2f2',
          color: '#dc2626',
          padding: '12px',
          borderRadius: '6px',
          marginBottom: '20px',
          border: '1px solid #fecaca'
        }}>
          <strong>Error:</strong> {error}
        </div>
      )}

      {/* Q&A Table */}
      <div style={{
        backgroundColor: 'white',
        border: '1px solid #e5e7eb',
        borderRadius: '8px',
        overflow: 'hidden'
      }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead style={{ backgroundColor: '#f9fafb' }}>
            <tr>
              <th style={{ 
                padding: '12px', 
                textAlign: 'left', 
                borderBottom: '1px solid #e5e7eb',
                fontSize: '14px',
                fontWeight: '600'
              }}>
                <input
                  type="checkbox"
                  checked={selectedItems.length === qaData.items.length && qaData.items.length > 0}
                  onChange={handleSelectAll}
                  style={{ marginRight: '8px' }}
                />
                Select All
              </th>
              <th style={{ 
                padding: '12px', 
                textAlign: 'left', 
                borderBottom: '1px solid #e5e7eb',
                fontSize: '14px',
                fontWeight: '600'
              }}>Question</th>
              <th style={{ 
                padding: '12px', 
                textAlign: 'left', 
                borderBottom: '1px solid #e5e7eb',
                fontSize: '14px',
                fontWeight: '600'
              }}>Answer</th>
              <th style={{ 
                padding: '12px', 
                textAlign: 'left', 
                borderBottom: '1px solid #e5e7eb',
                fontSize: '14px',
                fontWeight: '600'
              }}>Documents</th>
              <th style={{ 
                padding: '12px', 
                textAlign: 'left', 
                borderBottom: '1px solid #e5e7eb',
                fontSize: '14px',
                fontWeight: '600'
              }}>Date</th>
              <th style={{ 
                padding: '12px', 
                textAlign: 'left', 
                borderBottom: '1px solid #e5e7eb',
                fontSize: '14px',
                fontWeight: '600'
              }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {qaData.items.map((item) => (
              <tr key={item.id} style={{ 
                borderBottom: '1px solid #f3f4f6',
                backgroundColor: selectedItems.includes(item.id) ? '#f0f9ff' : 'white'
              }}>
                <td style={{ padding: '12px' }}>
                  <input
                    type="checkbox"
                    checked={selectedItems.includes(item.id)}
                    onChange={() => handleSelectItem(item.id)}
                  />
                </td>
                <td style={{ 
                  padding: '12px', 
                  maxWidth: '300px',
                  wordWrap: 'break-word'
                }}>
                  <div style={{ 
                    fontSize: '14px',
                    fontWeight: '500',
                    color: '#374151'
                  }}>
                    {truncateText(item.question, 150)}
                  </div>
                </td>
                <td style={{ 
                  padding: '12px', 
                  maxWidth: '300px',
                  wordWrap: 'break-word'
                }}>
                  <div style={{ 
                    fontSize: '14px',
                    color: '#6b7280'
                  }}>
                    {truncateText(item.answer, 150)}
                  </div>
                </td>
                <td style={{ padding: '12px' }}>
                  <div style={{ fontSize: '12px', color: '#6b7280' }}>
                    {item.document_names && item.document_names.length > 0 ? (
                      <div>
                        <div style={{ fontWeight: '500', marginBottom: '4px' }}>
                          {item.document_names.length} document(s)
                        </div>
                        <div style={{ maxHeight: '60px', overflow: 'hidden' }}>
                          {item.document_names.slice(0, 2).map((name, index) => (
                            <div key={index} style={{ 
                              fontSize: '11px',
                              color: '#9ca3af',
                              marginBottom: '2px'
                            }}>
                              • {truncateText(name, 40)}
                            </div>
                          ))}
                          {item.document_names.length > 2 && (
                            <div style={{ 
                              fontSize: '11px',
                              color: '#9ca3af',
                              fontStyle: 'italic'
                            }}>
                              +{item.document_names.length - 2} more...
                            </div>
                          )}
                        </div>
                      </div>
                    ) : (
                      <span style={{ color: '#9ca3af', fontStyle: 'italic' }}>No documents</span>
                    )}
                  </div>
                </td>
                <td style={{ padding: '12px' }}>
                  <div style={{ fontSize: '12px', color: '#6b7280' }}>
                    {formatDate(item.created_at)}
                  </div>
                </td>
                <td style={{ padding: '12px' }}>
                  <button
                    onClick={() => handleDelete(item.id)}
                    style={{
                      padding: '4px 8px',
                      backgroundColor: '#ef4444',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '12px'
                    }}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {qaData.items.length === 0 && !isLoading && (
          <div style={{
            padding: '40px',
            textAlign: 'center',
            color: '#6b7280'
          }}>
            <div style={{ fontSize: '32px', marginBottom: '16px' }}>💬</div>
            <h3 style={{ margin: '0 0 8px 0', color: '#374151' }}>No Q&A interactions found</h3>
            <p style={{ margin: 0, fontSize: '14px' }}>
              {searchQuery ? 'Try adjusting your search criteria.' : 'Start chatting with documents to see Q&A interactions here.'}
            </p>
          </div>
        )}

        {isLoading && (
          <div style={{
            padding: '40px',
            textAlign: 'center',
            color: '#6b7280'
          }}>
            <div style={{
              width: '32px',
              height: '32px',
              border: '3px solid #f3f4f6',
              borderTop: '3px solid #3b82f6',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
              margin: '0 auto 16px'
            }}></div>
            <p style={{ margin: 0, fontSize: '14px' }}>Loading Q&A interactions...</p>
          </div>
        )}
      </div>

      {/* Pagination */}
      {qaData.totalPages > 1 && (
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          gap: '12px',
          marginTop: '20px'
        }}>
          <button
            onClick={() => loadQAInteractions(qaData.page - 1, searchQuery)}
            disabled={qaData.page <= 1 || isLoading}
            style={{
              padding: '8px 12px',
              backgroundColor: qaData.page <= 1 || isLoading ? '#f3f4f6' : '#3b82f6',
              color: qaData.page <= 1 || isLoading ? '#9ca3af' : 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: qaData.page <= 1 || isLoading ? 'not-allowed' : 'pointer',
              fontSize: '14px'
            }}
          >
            Previous
          </button>
          
          <span style={{ fontSize: '14px', color: '#6b7280' }}>
            Page {qaData.page} of {qaData.totalPages} ({qaData.total} total)
          </span>
          
          <button
            onClick={() => loadQAInteractions(qaData.page + 1, searchQuery)}
            disabled={qaData.page >= qaData.totalPages || isLoading}
            style={{
              padding: '8px 12px',
              backgroundColor: qaData.page >= qaData.totalPages || isLoading ? '#f3f4f6' : '#3b82f6',
              color: qaData.page >= qaData.totalPages || isLoading ? '#9ca3af' : 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: qaData.page >= qaData.totalPages || isLoading ? 'not-allowed' : 'pointer',
              fontSize: '14px'
            }}
          >
            Next
          </button>
        </div>
      )}

      {/* CSS for spinner animation */}
      <style>
        {`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}
      </style>
    </div>
  );
}
