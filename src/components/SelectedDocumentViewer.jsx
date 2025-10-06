import React from 'react';

const SelectedDocumentViewer = React.forwardRef(({ selectedDocuments, onDocumentsSelected }, ref) => {
  const [activeDocument, setActiveDocument] = React.useState(null);
  const [documentContent, setDocumentContent] = React.useState('');
  const [isLoading, setIsLoading] = React.useState(false);

  const handleOpenDocument = React.useCallback(async (document) => {
    console.log('handleOpenDocument called with:', document);
    
    // Clean up previous blob URL to prevent memory leaks
    if (documentContent && documentContent.startsWith('blob:')) {
      URL.revokeObjectURL(documentContent);
    }
    
    setIsLoading(true);
    setActiveDocument(document);
    
    try {
      // First, convert document to PDF
      const versionParts = document.version ? document.version.split('.') : ['1', '0'];
      const major = versionParts[0] || 1;
      const minor = versionParts[1] || 0;
      
      console.log('Converting document to PDF...', { docId: document.veeva_document_id, major, minor });
      
      try {
        const convertResponse = await fetch('/api/convert-to-pdf', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            docId: document.veeva_document_id,
            major: major,
            minor: minor
          })
        });
        
        if (!convertResponse.ok) {
          console.warn(`PDF conversion failed: ${convertResponse.status} ${convertResponse.statusText}, falling back to original document`);
          throw new Error('PDF conversion service unavailable');
        }
        
        const convertData = await convertResponse.json();
        console.log('PDF conversion result:', convertData);
        
        if (convertData.error) {
          console.warn(`PDF conversion error: ${convertData.error}, falling back to original document`);
          throw new Error('PDF conversion failed');
        }
        
        // Now load the converted PDF
        const pdfUrl = convertData.pdfUrl || convertData.url;
        if (!pdfUrl) {
          throw new Error('No PDF URL returned from conversion service');
        }
        
        console.log('Loading converted PDF from URL:', pdfUrl);
        
        // For PDFs, we'll create a blob URL and display it in an iframe
        const pdfResponse = await fetch(pdfUrl);
        if (!pdfResponse.ok) {
          throw new Error(`Failed to fetch PDF: ${pdfResponse.status} ${pdfResponse.statusText}`);
        }
        
        const pdfBlob = await pdfResponse.blob();
        const pdfObjectUrl = URL.createObjectURL(pdfBlob);
        
        console.log('PDF loaded successfully, size:', pdfBlob.size);
        
        // Set the PDF URL for display
        setDocumentContent(pdfObjectUrl);
        
      } catch (convertError) {
        console.warn('PDF conversion failed, falling back to original document:', convertError.message);
        
        // Fallback: try to load the original document and detect if it's already a PDF
        const originalUrl = `/api/download-file?docId=${document.veeva_document_id}&major=${major}&minor=${minor}`;
        console.log('Loading original document from URL:', originalUrl);
        
        const response = await fetch(originalUrl);
        console.log('Original document response status:', response.status, 'Content-Type:', response.headers.get('content-type'));
        
        if (response.ok) {
          const contentType = response.headers.get('content-type') || '';
          const isPdf = contentType.includes('pdf') || contentType.includes('application/pdf');
          
          console.log('Original document analysis:', { contentType, isPdf, size: response.headers.get('content-length') });
          
          if (isPdf) {
            // It's already a PDF, load it directly
            const pdfBlob = await response.blob();
            const pdfObjectUrl = URL.createObjectURL(pdfBlob);
            console.log('Original document is PDF, loaded directly, size:', pdfBlob.size);
            setDocumentContent(pdfObjectUrl);
          } else {
            // Not a PDF, show message with download option
            console.log('Original document is not PDF, showing fallback message');
            setDocumentContent('This document cannot be displayed inline. PDF conversion is currently unavailable. Please use the download button to view the document.');
          }
        } else {
          console.error('Failed to load original document:', response.status, response.statusText);
          throw new Error(`Failed to load original document: ${response.status} ${response.statusText}`);
        }
      }
      
    } catch (error) {
      console.error('Error converting/loading document:', error);
      setDocumentContent(`Error loading document: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  }, [documentContent]);

  const handleCloseDocument = () => {
    // Clean up blob URL to prevent memory leaks
    if (documentContent && documentContent.startsWith('blob:')) {
      URL.revokeObjectURL(documentContent);
    }
    setActiveDocument(null);
    setDocumentContent('');
  };

  const handleRemoveDocument = (documentToRemove) => {
    onDocumentsSelected(selectedDocuments.filter(doc => doc.veeva_document_id !== documentToRemove.veeva_document_id));
  };

  // Expose handleOpenDocument function to parent component
  React.useImperativeHandle(ref, () => ({
    handleOpenDocument
  }), [handleOpenDocument]);

  // Debug logging
  React.useEffect(() => {
    console.log('SelectedDocumentViewer mounted, ref should be available');
  }, []);

  // Cleanup blob URL on unmount
  React.useEffect(() => {
    return () => {
      if (documentContent && documentContent.startsWith('blob:')) {
        URL.revokeObjectURL(documentContent);
      }
    };
  }, [documentContent]);

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
              {selectedDocuments.length > 0 && (
                <button
                  onClick={() => {
                    console.log('Test: Opening first document for testing');
                    handleOpenDocument(selectedDocuments[0]);
                  }}
                  style={{
                    marginTop: '8px',
                    padding: '4px 8px',
                    backgroundColor: '#10b981',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '4px',
                    fontSize: '10px',
                    cursor: 'pointer',
                    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                  }}
                >
                  Test Open First Doc
                </button>
              )}
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
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={() => {
                      const url = `/api/download-file?docId=${activeDocument.veeva_document_id}&major=${activeDocument.version?.split('.')[0] || 1}&minor=${activeDocument.version?.split('.')[1] || 0}`;
                      const link = document.createElement('a');
                      link.href = url;
                      link.download = activeDocument.document_name;
                      link.click();
                    }}
                    style={{
                      padding: '8px 16px',
                      backgroundColor: '#10b981',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '6px',
                      fontSize: '14px',
                      cursor: 'pointer',
                      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                      transition: 'background-color 0.2s ease'
                    }}
                    onMouseEnter={(e) => e.target.style.backgroundColor = '#059669'}
                    onMouseLeave={(e) => e.target.style.backgroundColor = '#10b981'}
                  >
                    📥 Download
                  </button>
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
                    height: '100%',
                    width: '100%'
                  }}>
                    {documentContent.startsWith('blob:') || documentContent.startsWith('http') ? (
                      /* PDF Viewer */
                      <iframe
                        src={documentContent}
                        style={{
                          width: '100%',
                          height: '100%',
                          border: 'none',
                          borderRadius: '4px'
                        }}
                        title={`PDF Viewer - ${activeDocument.document_name}`}
                        onError={(e) => {
                          console.error('PDF iframe error:', e);
                          setDocumentContent('Error loading PDF viewer. Please try downloading the document.');
                        }}
                      />
                    ) : documentContent.startsWith('PDF documents cannot be displayed') || 
                       documentContent.startsWith('Word documents (DOCX) cannot be displayed') ||
                       documentContent.startsWith('This document appears to be a binary file') ||
                       documentContent.startsWith('Document appears to be empty') ||
                       documentContent.startsWith('Document content could not be read') ||
                       documentContent.startsWith('Error loading document') ? (
                      /* Error State */
                      <div style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        height: '100%',
                        textAlign: 'center',
                        padding: '40px'
                      }}>
                        <div style={{ fontSize: '48px', marginBottom: '16px' }}>📄</div>
                        <h4 style={{
                          margin: '0 0 8px 0',
                          color: '#374151',
                          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                        }}>
                          Document Preview Not Available
                        </h4>
                        <p style={{
                          margin: '0 0 16px 0',
                          fontSize: '14px',
                          lineHeight: '1.5',
                          color: '#6b7280',
                          maxWidth: '400px',
                          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                        }}>
                          {documentContent}
                        </p>
                        <div style={{
                          padding: '12px 20px',
                          backgroundColor: '#f3f4f6',
                          borderRadius: '8px',
                          fontSize: '13px',
                          color: '#6b7280',
                          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                        }}>
                          Use the Download button above to save the document to your computer
                        </div>
                      </div>
                    ) : (
                      /* Text Content */
                      <div style={{
                        color: '#374151',
                        lineHeight: '1.6',
                        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                        whiteSpace: 'pre-wrap',
                        wordWrap: 'break-word',
                        padding: '20px'
                      }}>
                        {documentContent}
                      </div>
                    )}
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
});

export default SelectedDocumentViewer;
