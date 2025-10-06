import React from 'react';

export default function SelectedDocumentViewer({ selectedDocuments, onDocumentsSelected }) {
  const [activeDocument, setActiveDocument] = React.useState(null);
  const [documentContent, setDocumentContent] = React.useState('');
  const [isLoading, setIsLoading] = React.useState(false);

  const handleOpenDocument = async (document) => {
    setIsLoading(true);
    setActiveDocument(document);
    
    try {
      // Fetch document content
      const url = `/api/download-file?docId=${document.veeva_document_id}&major=${document.version?.split('.')[0] || 1}&minor=${document.version?.split('.')[1] || 0}`;
      const response = await fetch(url);
      
      if (response.ok) {
        // For PDFs, we'll show a message since we can't render PDFs inline
        if (document.document_type === 'PDF') {
          setDocumentContent('PDF documents cannot be displayed inline. Please use the download feature.');
        } else {
          // For other document types, try to get text content
          const text = await response.text();
          setDocumentContent(text);
        }
      } else {
        setDocumentContent('Error loading document content.');
      }
    } catch (error) {
      console.error('Error loading document:', error);
      setDocumentContent('Error loading document content.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCloseDocument = () => {
    setActiveDocument(null);
    setDocumentContent('');
  };

  const handleRemoveDocument = (documentToRemove) => {
    onDocumentsSelected(selectedDocuments.filter(doc => doc.veeva_document_id !== documentToRemove.veeva_document_id));
  };

  return (
    <>
      <div style={{
        backgroundColor: '#ffffff',
        border: '1px solid #e5e7eb',
        borderRadius: '8px',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)'
      }}>
        {/* Header */}
        <div style={{
          padding: '16px 20px',
          borderBottom: '1px solid #e5e7eb',
          backgroundColor: '#f8fafc',
          borderTopLeftRadius: '8px',
          borderTopRightRadius: '8px'
        }}>
          <h3 style={{
            margin: 0,
            fontSize: '18px',
            fontWeight: '600',
            color: '#374151',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
          }}>
            Selected Documents
          </h3>
          <p style={{
            margin: '4px 0 0 0',
            fontSize: '12px',
            color: '#6b7280',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
          }}>
            {selectedDocuments.length} document{selectedDocuments.length !== 1 ? 's' : ''} selected for chat
          </p>
        </div>

        {/* Content */}
        <div style={{
          flex: 1,
          overflow: 'auto',
          padding: '20px'
        }}>
          {activeDocument ? (
            /* Document Content View */
            <div style={{
              height: '100%',
              display: 'flex',
              flexDirection: 'column'
            }}>
              {/* Document Header */}
              <div style={{
                padding: '16px',
                backgroundColor: '#f8fafc',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                marginBottom: '16px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <div>
                  <h4 style={{
                    margin: '0 0 4px 0',
                    fontSize: '18px',
                    fontWeight: '600',
                    color: '#374151',
                    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                  }}>
                    {activeDocument.document_name}
                  </h4>
                  <div style={{
                    fontSize: '14px',
                    color: '#6b7280',
                    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                  }}>
                    {activeDocument.document_type} • Version {activeDocument.version} • {activeDocument.document_number}
                  </div>
                </div>
                <button
                  onClick={handleCloseDocument}
                  style={{
                    padding: '8px 16px',
                    backgroundColor: '#6b7280',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '14px',
                    cursor: 'pointer',
                    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                    transition: 'background-color 0.2s ease'
                  }}
                  onMouseEnter={(e) => e.target.style.backgroundColor = '#4b5563'}
                  onMouseLeave={(e) => e.target.style.backgroundColor = '#6b7280'}
                >
                  ← Back to List
                </button>
              </div>

              {/* Document Content */}
              <div style={{
                flex: 1,
                backgroundColor: '#ffffff',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                padding: '20px',
                overflow: 'auto'
              }}>
                {isLoading ? (
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    height: '100%',
                    color: '#6b7280'
                  }}>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '24px', marginBottom: '8px' }}>⏳</div>
                      <p style={{ margin: 0, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
                        Loading document content...
                      </p>
                    </div>
                  </div>
                ) : (
                  <div style={{
                    color: '#374151',
                    lineHeight: '1.6',
                    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                    whiteSpace: 'pre-wrap',
                    wordWrap: 'break-word'
                  }}>
                    {documentContent}
                  </div>
                )}
              </div>
            </div>
          ) : selectedDocuments.length === 0 ? (
            /* No Documents Selected */
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              textAlign: 'center',
              color: '#6b7280'
            }}>
              <div style={{ fontSize: '48px', marginBottom: '16px' }}>📄</div>
              <h4 style={{
                margin: '0 0 8px 0',
                color: '#374151',
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
              }}>
                No documents selected
              </h4>
              <p style={{
                margin: 0,
                fontSize: '14px',
                lineHeight: '1.5',
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
              }}>
                Go to the Admin Panel to select documents for chat. You can select multiple documents to use in your conversations.
              </p>
            </div>
          ) : (
            /* Document List View */
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '12px'
            }}>
              {selectedDocuments.map((doc, index) => (
                <div key={doc.veeva_document_id || index} style={{
                  padding: '16px',
                  backgroundColor: '#f8fafc',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  transition: 'all 0.2s ease'
                }}>
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    marginBottom: '8px'
                  }}>
                    <div style={{ flex: 1 }}>
                      <h4 style={{
                        margin: '0 0 4px 0',
                        fontSize: '16px',
                        fontWeight: '600',
                        color: '#374151',
                        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                      }}>
                        {doc.document_name}
                      </h4>
                      <div style={{
                        fontSize: '12px',
                        color: '#6b7280',
                        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                        marginBottom: '8px'
                      }}>
                        {doc.document_type} • Version {doc.version} • {doc.document_number}
                      </div>
                      {doc.summary && (
                        <p style={{
                          margin: 0,
                          fontSize: '13px',
                          color: '#6b7280',
                          lineHeight: '1.4',
                          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                        }}>
                          {doc.summary.length > 150 ? `${doc.summary.substring(0, 150)}...` : doc.summary}
                        </p>
                      )}
                    </div>
                    <button
                      onClick={() => handleRemoveDocument(doc)}
                      style={{
                        padding: '4px 8px',
                        backgroundColor: '#dc2626',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: '4px',
                        fontSize: '11px',
                        cursor: 'pointer',
                        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                        marginLeft: '12px'
                      }}
                      title="Remove from chat"
                    >
                      Remove
                    </button>
                  </div>
                  
                  <div style={{
                    display: 'flex',
                    gap: '8px'
                  }}>
                    <button
                      onClick={() => handleOpenDocument(doc)}
                      style={{
                        padding: '6px 12px',
                        backgroundColor: '#4338ca',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: '6px',
                        fontSize: '12px',
                        cursor: 'pointer',
                        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                        transition: 'background-color 0.2s ease'
                      }}
                      onMouseEnter={(e) => e.target.style.backgroundColor = '#312e81'}
                      onMouseLeave={(e) => e.target.style.backgroundColor = '#4338ca'}
                    >
                      📖 View Document
                    </button>
                    <div style={{
                      padding: '6px 12px',
                      backgroundColor: '#dbeafe',
                      color: '#1e40af',
                      borderRadius: '6px',
                      fontSize: '12px',
                      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}>
                      💬 Ready for chat
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

    </>
  );
}
